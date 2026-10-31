import { createClient, custom, getAddress, parseEventLogs, toHex, type EIP1193Provider, type TransactionReceipt } from 'viem';
import { simulateContract, waitForTransactionReceipt, writeContract } from 'viem/actions';
import type { Address, Hash, WalletSession } from '../types';
import { TURING_WHEEL_ABI } from './abi';
import {
  SEPOLIA,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  SEPOLIA_EXPLORER_URL,
  SEPOLIA_RPC_URLS,
  TURING_WHEEL_ADDRESS,
} from './config';
import { createReadClient, type ReadClientOptions } from './rpc';
import { WalletError, isUnknownChain, sourceProblem, toWalletError } from './wallet-errors';
import { providerFor, type Eip1193Provider } from './wallets';

export interface ConnectOptions extends ReadClientOptions {
  readonly address?: Address | null;
  readonly pollingMs?: number;
  readonly receiptTimeoutMs?: number;
}

interface Transaction {
  simulate(blockNumber?: bigint): Promise<unknown>;
  send(): Promise<Hash>;
}

const RECEIPT_TIMEOUT_MS = 5 * 60_000;
const RECEIPT_POLL_MS = 3_000;

const ADD_SEPOLIA = {
  chainId: SEPOLIA_CHAIN_ID_HEX,
  chainName: SEPOLIA.name,
  nativeCurrency: SEPOLIA.nativeCurrency,
  rpcUrls: SEPOLIA_RPC_URLS,
  blockExplorerUrls: [SEPOLIA_EXPLORER_URL],
};

async function isOnSepolia(provider: Eip1193Provider): Promise<boolean> {
  return Number(await provider.request({ method: 'eth_chainId' })) === SEPOLIA_CHAIN_ID;
}

async function ensureSepolia(provider: Eip1193Provider): Promise<void> {
  if (await isOnSepolia(provider)) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }] });
  } catch (error) {
    if (!isUnknownChain(error)) throw error;
    await provider.request({ method: 'wallet_addEthereumChain', params: [ADD_SEPOLIA] });
  }
  if (!(await isOnSepolia(provider))) throw new WalletError('wrong-network', 'Switch your wallet to Sepolia to continue.');
}

function createSession(
  provider: Eip1193Provider,
  address: Address,
  contract: Address | null,
  options: ConnectOptions,
): WalletSession {
  const reader = createReadClient(options);
  const wallet = createClient({
    account: address,
    chain: SEPOLIA,
    transport: custom(provider as EIP1193Provider, { retryCount: 0 }),
  });
  let closed = false;

  async function assertSameAccount(): Promise<void> {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as readonly string[];
    const known = accounts.map((account) => account.toLowerCase());
    if (!known.includes(address.toLowerCase())) {
      throw new WalletError('account-changed', 'Your wallet moved to another account. Reconnect to continue.');
    }
  }

  async function explainRevert(transaction: Transaction, receipt: TransactionReceipt): Promise<WalletError> {
    const hash = receipt.transactionHash;
    try {
      await transaction.simulate(receipt.blockNumber);
    } catch (error) {
      const replayed = toWalletError(error, hash);
      if (replayed.kind === 'reverted') return replayed;
    }
    return new WalletError('reverted', 'The transaction reverted on-chain.', hash);
  }

  async function mined(hash: Hash): Promise<TransactionReceipt> {
    try {
      return await waitForTransactionReceipt(reader, {
        hash,
        timeout: options.receiptTimeoutMs ?? RECEIPT_TIMEOUT_MS,
        pollingInterval: options.pollingMs ?? RECEIPT_POLL_MS,
      });
    } catch {
      throw new WalletError('pending', 'Sent, but not mined yet. It may still land.', hash);
    }
  }

  async function transact(transaction: Transaction): Promise<TransactionReceipt> {
    if (closed) throw new WalletError('disconnected', 'The wallet is disconnected.');
    try {
      await assertSameAccount();
      await ensureSepolia(provider);
      await transaction.simulate();
      const receipt = await mined(await transaction.send());
      if (receipt.status === 'reverted') throw await explainRevert(transaction, receipt);
      return receipt;
    } catch (error) {
      throw toWalletError(error);
    }
  }

  function deployed(): Address {
    if (contract === null) throw new WalletError('not-deployed', 'Turing Wheel is not deployed yet, so nothing can be queued.');
    return contract;
  }

  return {
    address,
    async submit(source) {
      const problem = sourceProblem(source);
      if (problem !== null) throw new WalletError('invalid-source', problem);
      const call = {
        address: deployed(),
        abi: TURING_WHEEL_ABI,
        account: address,
        functionName: 'submit',
        args: [toHex(source)],
      } as const;
      const receipt = await transact({
        simulate: (blockNumber) => simulateContract(reader, { ...call, blockNumber }),
        send: () => writeContract(wallet, { ...call, chain: SEPOLIA }),
      });
      const [queued] = parseEventLogs({ abi: TURING_WHEEL_ABI, eventName: 'ProgramQueued', logs: receipt.logs });
      if (queued === undefined) {
        throw new WalletError('failed', 'Mined, but the program id was missing from the receipt.', receipt.transactionHash);
      }
      return { hash: receipt.transactionHash, programId: Number(queued.args.id) };
    },
    async squeek(programId) {
      const call = {
        address: deployed(),
        abi: TURING_WHEEL_ABI,
        account: address,
        functionName: 'squeek',
        args: [BigInt(programId)],
      } as const;
      const receipt = await transact({
        simulate: (blockNumber) => simulateContract(reader, { ...call, blockNumber }),
        send: () => writeContract(wallet, { ...call, chain: SEPOLIA }),
      });
      return receipt.transactionHash;
    },
    disconnect() {
      closed = true;
    },
  };
}

export async function openSession(id: string, options: ConnectOptions = {}): Promise<WalletSession> {
  const provider = providerFor(id);
  if (provider === null) throw new WalletError('unavailable', 'That wallet is no longer available.');
  const contract = options.address === undefined ? TURING_WHEEL_ADDRESS : options.address;
  try {
    const [account] = (await provider.request({ method: 'eth_requestAccounts' })) as readonly string[];
    if (account === undefined) throw new WalletError('unavailable', 'The wallet did not share an account.');
    await ensureSepolia(provider);
    return createSession(provider, getAddress(account), contract, options);
  } catch (error) {
    throw toWalletError(error);
  }
}
