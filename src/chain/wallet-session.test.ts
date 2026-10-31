import { encodeAbiParameters, encodeErrorResult, encodeEventTopics, encodeFunctionResult, type Hex } from 'viem';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Address, WalletSession } from '../types';
import { TURING_WHEEL_ABI } from './abi';
import { fakeRpc } from './test-helpers';
import { WalletError, isUserRejection } from './wallet-errors';
import { connectWallet, discoverWallets, type WalletHost } from './wallets';

const CONTRACT: Address = '0x1111111111111111111111111111111111111111';
const ACCOUNT: Address = '0x00000000000000000000000000000000000000AA';
const OTHER_ACCOUNT: Address = '0x00000000000000000000000000000000000000BB';
const TX_HASH = `0x${'ab'.repeat(32)}` as const;
const SEPOLIA_HEX = '0xaa36a7';
const MAINNET_HEX = '0x1';

type Request = { readonly method: string; readonly params?: readonly unknown[] };
type Handler = (request: Request) => unknown;

function rpcError(code: number, message: string, data?: unknown): Error {
  return Object.assign(new Error(message), { code, ...(data === undefined ? {} : { data }) });
}

const USER_REJECTED = () => rpcError(4001, 'User rejected the request.');

function fakeWallet(options: { chainId?: string; accounts?: readonly Address[]; override?: Handler } = {}) {
  const requests: Request[] = [];
  const wallet = {
    chainId: options.chainId ?? SEPOLIA_HEX,
    accounts: options.accounts ?? [ACCOUNT],
    requests,
    methods: () => requests.map((request) => request.method),
    request: async (request: Request) => {
      requests.push(request);
      const custom = options.override?.(request);
      if (custom !== undefined) return custom;
      switch (request.method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return wallet.accounts;
        case 'eth_chainId':
          return wallet.chainId;
        case 'wallet_switchEthereumChain':
          wallet.chainId = (request.params?.[0] as { chainId: string }).chainId;
          return null;
        case 'eth_sendTransaction':
          return TX_HASH;
        default:
          throw rpcError(-32601, `The method ${request.method} does not exist`);
      }
    },
  };
  return wallet;
}

type FakeWallet = ReturnType<typeof fakeWallet>;

let testNumber = 0;
let urls: readonly string[];
beforeEach(() => {
  testNumber += 1;
  urls = [`https://wallet-rpc-${testNumber}.test/`];
});

const sessions: WalletSession[] = [];
afterEach(() => {
  sessions.splice(0).forEach((session) => session.disconnect());
});

async function register(wallet: FakeWallet): Promise<string> {
  const target: WalletHost = new EventTarget();
  target.addEventListener('eip6963:requestProvider', () => {
    target.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { info: { uuid: 'u', name: 'Fake', icon: '', rdns: 'test.fake' }, provider: wallet },
      }),
    );
  });
  const [option] = await discoverWallets({ target, windowMs: 1 });
  return option?.id ?? 'missing';
}

function queuedLog(id: bigint): unknown {
  return {
    address: CONTRACT,
    blockHash: `0x${'11'.repeat(32)}`,
    blockNumber: '0x10',
    data: encodeAbiParameters(
      [{ type: 'uint64' }, { type: 'uint64' }, { type: 'bytes' }],
      [58_000n, 58_512n, '0x7421'],
    ),
    logIndex: '0x0',
    removed: false,
    topics: encodeEventTopics({ abi: TURING_WHEEL_ABI, eventName: 'ProgramQueued', args: { id, author: ACCOUNT } }),
    transactionHash: TX_HASH,
    transactionIndex: '0x0',
  };
}

function receipt(status: '0x1' | '0x0', logs: readonly unknown[] = []): unknown {
  return {
    blockHash: `0x${'11'.repeat(32)}`,
    blockNumber: '0x10',
    contractAddress: null,
    cumulativeGasUsed: '0x5208',
    effectiveGasPrice: '0x1',
    from: ACCOUNT,
    gasUsed: '0x5208',
    logs,
    logsBloom: `0x${'00'.repeat(256)}`,
    status,
    to: CONTRACT,
    transactionHash: TX_HASH,
    transactionIndex: '0x0',
    type: '0x2',
  };
}

const revertData = (data: Hex) => ({ error: { code: 3, message: 'execution reverted', data } });
const revertOf = (errorName: Parameters<typeof encodeErrorResult<typeof TURING_WHEEL_ABI>>[0]['errorName'], args?: readonly unknown[]) =>
  revertData(encodeErrorResult({ abi: TURING_WHEEL_ABI, errorName, args } as never));

interface Chain {
  readonly call?: () => unknown;
  readonly receipt?: () => unknown;
}

function chain(behaviour: Chain = {}) {
  return fakeRpc(
    () => [],
    () => false,
    (request) => {
      if (request.method === 'eth_blockNumber') return { result: '0x10' };
      if (request.method === 'eth_getTransactionReceipt') {
        return { result: (behaviour.receipt ?? (() => receipt('0x1', [queuedLog(7n)])))() };
      }
      if (request.method === 'eth_getTransactionByHash') return { result: null };
      if (request.method === 'eth_call') {
        return (
          behaviour.call?.() ?? {
            result: encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName: 'submit', result: 7n }),
          }
        );
      }
      return undefined;
    },
  );
}

async function connect(wallet: FakeWallet, rpc = chain(), address: Address | null = CONTRACT): Promise<WalletSession> {
  const session = await connectWallet(await register(wallet), {
    address,
    urls,
    fetch: rpc.fetch,
    pollingMs: 5,
    receiptTimeoutMs: 400,
  });
  sessions.push(session);
  return session;
}

async function failure(attempt: Promise<unknown>): Promise<WalletError> {
  const outcome = await attempt.then(
    () => new Error('expected a rejection'),
    (error: unknown) => error,
  );
  expect(outcome).toBeInstanceOf(WalletError);
  return outcome as WalletError;
}

describe('connectWallet', () => {
  it('returns a session for the first account', async () => {
    const session = await connect(fakeWallet({ accounts: [ACCOUNT, OTHER_ACCOUNT] }));
    expect(session.address).toBe(ACCOUNT);
  });

  it('leaves the network alone when already on Sepolia', async () => {
    const wallet = fakeWallet();
    await connect(wallet);
    expect(wallet.methods()).not.toContain('wallet_switchEthereumChain');
  });

  it('switches to Sepolia when on another network', async () => {
    const wallet = fakeWallet({ chainId: MAINNET_HEX });
    await connect(wallet);
    expect(wallet.requests.find((request) => request.method === 'wallet_switchEthereumChain')?.params).toEqual([
      { chainId: SEPOLIA_HEX },
    ]);
    expect(wallet.chainId).toBe(SEPOLIA_HEX);
  });

  it.each<[string, () => Error]>([
    ['the standard 4902', () => rpcError(4902, 'Unrecognized chain')],
    ['mobile MetaMask wrapping 4902 in -32603', () => rpcError(-32603, 'Internal', { originalError: { code: 4902 } })],
  ])('adds Sepolia when the wallet does not know it, via %s', async (_name, unknownChain) => {
    const added: unknown[] = [];
    const wallet: FakeWallet = fakeWallet({
      chainId: MAINNET_HEX,
      override: (request) => {
        if (request.method === 'wallet_switchEthereumChain') throw unknownChain();
        if (request.method === 'wallet_addEthereumChain') {
          added.push(request.params?.[0]);
          wallet.chainId = SEPOLIA_HEX;
          return null;
        }
        return undefined;
      },
    });
    await connect(wallet);
    expect(added[0]).toMatchObject({
      chainId: SEPOLIA_HEX,
      chainName: 'Sepolia',
      nativeCurrency: { symbol: 'ETH', decimals: 18 },
    });
    expect((added[0] as { rpcUrls: readonly string[] }).rpcUrls.length).toBeGreaterThan(0);
  });

  it.each(['eth_requestAccounts', 'wallet_switchEthereumChain'])('treats rejecting %s as a clean cancel', async (method) => {
    const wallet = fakeWallet({
      chainId: MAINNET_HEX,
      override: (request) => {
        if (request.method === method) throw USER_REJECTED();
        return undefined;
      },
    });
    expect(isUserRejection(await failure(connect(wallet)))).toBe(true);
  });

  it('treats rejecting the add-network prompt as a clean cancel', async () => {
    const wallet = fakeWallet({
      chainId: MAINNET_HEX,
      override: (request) => {
        if (request.method === 'wallet_switchEthereumChain') throw rpcError(4902, 'Unrecognized chain');
        if (request.method === 'wallet_addEthereumChain') throw USER_REJECTED();
        return undefined;
      },
    });
    expect(isUserRejection(await failure(connect(wallet)))).toBe(true);
  });

  it('reports a wallet that claims to switch but stays put', async () => {
    const wallet = fakeWallet({
      chainId: MAINNET_HEX,
      override: (request) => (request.method === 'wallet_switchEthereumChain' ? null : undefined),
    });
    expect((await failure(connect(wallet))).kind).toBe('wrong-network');
  });

  it('reports a wallet that shares no account', async () => {
    expect((await failure(connect(fakeWallet({ accounts: [] })))).kind).toBe('unavailable');
  });

  it('reports a wallet id that discovery never produced', async () => {
    expect((await failure(connectWallet('never.seen'))).kind).toBe('unavailable');
  });

  it('keeps a real wallet failure distinct from a cancel', async () => {
    const wallet = fakeWallet({
      override: (request) => {
        if (request.method === 'eth_requestAccounts') throw rpcError(-32002, 'Request already pending');
        return undefined;
      },
    });
    const error = await failure(connect(wallet));
    expect(isUserRejection(error)).toBe(false);
    expect(error.kind).toBe('failed');
  });
});

describe('submit', () => {
  it('resolves with the hash and the id from the mined event, not the simulation', async () => {
    const rpc = chain({
      call: () => ({ result: encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName: 'submit', result: 6n }) }),
      receipt: () => receipt('0x1', [queuedLog(7n)]),
    });
    const session = await connect(fakeWallet(), rpc);
    expect(await session.submit('sin(t)')).toEqual({ hash: TX_HASH, programId: 7 });
  });

  it('sends the source as bytes to the contract from the connected account', async () => {
    const wallet = fakeWallet();
    const session = await connect(wallet);
    await session.submit('t');
    const sent = wallet.requests.find((request) => request.method === 'eth_sendTransaction');
    const [transaction] = (sent?.params ?? []) as readonly [{ from: string; to: string; data: string }];
    expect(transaction.to.toLowerCase()).toBe(CONTRACT);
    expect(transaction.from.toLowerCase()).toBe(ACCOUNT.toLowerCase());
    const lengthWord = transaction.data.slice(-128, -64);
    const bytesWord = transaction.data.slice(-64);
    expect(lengthWord).toBe('0000000000000000000000000000000000000000000000000000000000000001');
    expect(bytesWord).toBe('7400000000000000000000000000000000000000000000000000000000000000');
  });

  it('simulates before asking the wallet to send anything', async () => {
    const wallet = fakeWallet();
    const rpc = chain({ call: () => revertOf('SourceEmpty') });
    const session = await connect(wallet, rpc);
    await failure(session.submit('t'));
    expect(wallet.methods()).not.toContain('eth_sendTransaction');
  });

  it.each<[string, string, RegExp]>([
    ['an empty source', '', /empty/i],
    ['141 bytes', 'x'.repeat(141), /140/],
    ['a newline', 'x\ny', /ascii/i],
  ])('stops %s before touching the wallet or the chain', async (_name, source, wording) => {
    const wallet = fakeWallet();
    const rpc = chain();
    const session = await connect(wallet, rpc);
    const requestsAtConnect = wallet.requests.length;
    const postsAtConnect = rpc.posts.length;

    const error = await failure(session.submit(source));

    expect(error.kind).toBe('invalid-source');
    expect(error.message).toMatch(wording);
    expect(wallet.requests).toHaveLength(requestsAtConnect);
    expect(rpc.posts).toHaveLength(postsAtConnect);
  });

  it('names the cycle an already queued program clears at', async () => {
    const session = await connect(fakeWallet(), chain({ call: () => revertOf('AlreadyQueued', [59_030n]) }));
    const error = await failure(session.submit('t'));
    expect(error.kind).toBe('reverted');
    expect(error.message).toContain('59030');
  });

  it.each<[Parameters<typeof revertOf>[0], RegExp]>([
    ['SourceEmpty', /empty/i],
    ['SourceTooLong', /140/],
    ['SourceNotAscii', /ascii/i],
  ])('explains %s in plain words', async (errorName, wording) => {
    const session = await connect(fakeWallet(), chain({ call: () => revertOf(errorName) }));
    const error = await failure(session.submit('t'));
    expect(error.message).toMatch(wording);
    expect(error.message).not.toMatch(/0x|revert/i);
  });

  it('treats rejecting the transaction as a clean cancel', async () => {
    const wallet = fakeWallet({
      override: (request) => {
        if (request.method === 'eth_sendTransaction') throw USER_REJECTED();
        return undefined;
      },
    });
    const session = await connect(wallet);
    expect(isUserRejection(await failure(session.submit('t')))).toBe(true);
  });

  it('explains running out of Sepolia ETH', async () => {
    const wallet = fakeWallet({
      override: (request) => {
        if (request.method === 'eth_sendTransaction') throw rpcError(-32000, 'insufficient funds for gas * price + value');
        return undefined;
      },
    });
    const session = await connect(wallet);
    expect((await failure(session.submit('t'))).message).toMatch(/sepolia eth/i);
  });

  it('decodes why a transaction reverted after being mined', async () => {
    let calls = 0;
    const rpc = chain({
      call: () => {
        calls += 1;
        return calls === 1
          ? { result: encodeFunctionResult({ abi: TURING_WHEEL_ABI, functionName: 'submit', result: 7n }) }
          : revertOf('AlreadyQueued', [60_000n]);
      },
      receipt: () => receipt('0x0'),
    });
    const session = await connect(fakeWallet(), rpc);
    const error = await failure(session.submit('t'));
    expect(error).toMatchObject({ kind: 'reverted', hash: TX_HASH });
    expect(error.message).toContain('60000');
  });

  it('still reports a mined revert when the replay finds nothing', async () => {
    const rpc = chain({ receipt: () => receipt('0x0') });
    const session = await connect(fakeWallet(), rpc);
    expect(await failure(session.submit('t'))).toMatchObject({ kind: 'reverted', hash: TX_HASH });
  });

  it('hands back the hash when the transaction is slow to mine', async () => {
    const session = await connect(fakeWallet(), chain({ receipt: () => null }));
    expect(await failure(session.submit('t'))).toMatchObject({ kind: 'pending', hash: TX_HASH });
  });

  it('refuses to send when the wallet moved to another account', async () => {
    const wallet = fakeWallet();
    const session = await connect(wallet);
    wallet.accounts = [OTHER_ACCOUNT];
    expect((await failure(session.submit('t'))).kind).toBe('account-changed');
    expect(wallet.methods()).not.toContain('eth_sendTransaction');
  });

  it('switches back when the wallet left Sepolia after connecting', async () => {
    const wallet = fakeWallet();
    const session = await connect(wallet);
    wallet.chainId = MAINNET_HEX;
    await session.submit('t');
    expect(wallet.chainId).toBe(SEPOLIA_HEX);
    expect(wallet.methods()).toContain('eth_sendTransaction');
  });

  it('explains that nothing can be queued before deployment', async () => {
    const wallet = fakeWallet();
    const session = await connect(wallet, chain(), null);
    expect((await failure(session.submit('t'))).kind).toBe('not-deployed');
    expect(wallet.methods()).not.toContain('eth_sendTransaction');
  });

  it('refuses to send after disconnect', async () => {
    const wallet = fakeWallet();
    const session = await connect(wallet);
    session.disconnect();
    expect((await failure(session.submit('t'))).kind).toBe('disconnected');
    expect(wallet.methods()).not.toContain('eth_sendTransaction');
  });
});

describe('squeek', () => {
  const emptyCall = { result: '0x' };

  it('resolves with the hash once mined', async () => {
    const session = await connect(fakeWallet(), chain({ call: () => emptyCall, receipt: () => receipt('0x1') }));
    expect(await session.squeek(3)).toBe(TX_HASH);
  });

  it('sends the program id', async () => {
    const wallet = fakeWallet();
    const session = await connect(wallet, chain({ call: () => emptyCall, receipt: () => receipt('0x1') }));
    await session.squeek(3);
    const sent = wallet.requests.find((request) => request.method === 'eth_sendTransaction');
    const [transaction] = (sent?.params ?? []) as readonly [{ data: string }];
    expect(transaction.data.slice(-2)).toBe('03');
  });

  it.each<[Parameters<typeof revertOf>[0], RegExp]>([
    ['AlreadySqueeked', /already/i],
    ['UnknownProgram', /exist/i],
  ])('explains %s in plain words', async (errorName, wording) => {
    const session = await connect(fakeWallet(), chain({ call: () => revertOf(errorName) }));
    expect((await failure(session.squeek(3))).message).toMatch(wording);
  });

  it('treats rejecting the transaction as a clean cancel', async () => {
    const wallet = fakeWallet({
      override: (request) => {
        if (request.method === 'eth_sendTransaction') throw USER_REJECTED();
        return undefined;
      },
    });
    const session = await connect(wallet, chain({ call: () => emptyCall }));
    expect(isUserRejection(await failure(session.squeek(3)))).toBe(true);
  });
});
