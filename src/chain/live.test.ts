import { decodeAbiParameters, type Hex } from 'viem';
import { simulateContract } from 'viem/actions';
import { describe, expect, it, vi } from 'vitest';
import { MAX_SOURCE_BYTES, SLICE_PASSES, type Address } from '../types';
import { TURING_WHEEL_ABI } from './abi';
import { SEPOLIA_RPC_URLS, TURING_WHEEL_ADDRESS } from './config';
import { createContractReads } from './contract-reads';
import { previewQueue } from './preview';
import { createQueueReader } from './queue';
import { createReadClient } from './rpc';
import { toWalletError } from './wallet-errors';

// Reads the real contract, so it stays out of the normal run: VITE_LIVE_CHAIN=1 npx vitest run src/chain/live
const LIVE = import.meta.env['VITE_LIVE_CHAIN'] === '1';

const CORE: Address = '0x980b4424c007caf7a1f3670b48c8eaef7ebc3d44';
const NEVER_QUEUED: Address = '0x000000000000000000000000000000000000dEaD';
const contract = TURING_WHEEL_ADDRESS as Address;
const uncached = () => createReadClient();

async function settledWork(): Promise<number> {
  const data = (await uncached().request({
    method: 'eth_call',
    params: [{ to: CORE, data: '0xc19d93fb' }, 'latest'],
  })) as Hex;
  return Number(decodeAbiParameters([{ type: 'uint64' }, { type: 'uint64' }], data)[1]);
}

async function revertOf(
  url: string,
  call: { functionName: 'submit'; args: readonly [Hex] } | { functionName: 'squeek'; args: readonly [bigint] },
  account: Address = NEVER_QUEUED,
) {
  const client = createReadClient({ urls: [url] });
  const base = { address: contract, abi: TURING_WHEEL_ABI, account };
  const attempt =
    call.functionName === 'submit'
      ? simulateContract(client, { ...base, functionName: 'submit', args: call.args })
      : simulateContract(client, { ...base, functionName: 'squeek', args: call.args });
  return attempt.then(
    () => null,
    (error: unknown) => toWalletError(error),
  );
}

describe.runIf(LIVE)('the deployed contract on Sepolia', { timeout: 30_000 }, () => {
  const reads = () => createContractReads(uncached(), contract);

  it('has the constants the app mirrors', async () => {
    expect(await reads().uint('LEAD')).toBe(768);
    expect(await reads().uint('SLICE')).toBe(SLICE_PASSES);
    const maxBytes = await uncached().request({
      method: 'eth_call',
      params: [{ to: contract, data: '0x683964d5' }, 'latest'],
    });
    expect(Number(maxBytes)).toBe(MAX_SOURCE_BYTES);
  });

  it('reads the same settled work as the core contract', async () => {
    expect(await reads().uint('currentWork')).toBe(await settledWork());
  });

  it('syncs the queue reader with its defaults', async () => {
    const queue = createQueueReader();
    try {
      await vi.waitFor(() => expect(queue.lastSyncAt()).not.toBeNull(), { timeout: 15_000, interval: 50 });
      expect(queue.list()).toHaveLength(await reads().uint('programCount'));
      queue.list().forEach((program, index) => expect(program.id).toBe(index));
    } finally {
      queue.stop();
    }
  });

  it('previews what the contract would assign', async () => {
    const [preview, queueEnd, currentWork] = await Promise.all([
      previewQueue(),
      reads().uint('queueEnd'),
      reads().uint('currentWork'),
    ]);
    const expectedStart = Math.max(queueEnd, currentWork + 768);
    expect(preview).toEqual({
      startWork: expectedStart,
      endWork: expectedStart + 512,
      waitCycles: expectedStart - currentWork,
      currentWork,
      heldUntil: null,
    });
  });

  it('holds nothing against an account that never queued', async () => {
    expect((await previewQueue({ account: NEVER_QUEUED }))?.heldUntil).toBeNull();
  });

  it.each(SEPOLIA_RPC_URLS)('reads through %s alone', async (url) => {
    const single = createContractReads(createReadClient({ urls: [url] }), contract);
    const [count, lead] = await Promise.all([single.uint('programCount'), single.uint('LEAD')]);
    expect(lead).toBe(768);
    expect(await single.page(0)).toHaveLength(Math.min(count, 50));
  });

  it.each(SEPOLIA_RPC_URLS)('decodes a real SourceEmpty revert through %s', async (url) => {
    const error = await revertOf(url, { functionName: 'submit', args: ['0x'] });
    expect(error?.kind).toBe('reverted');
    expect(error?.message).toMatch(/empty/i);
  });

  it.each(SEPOLIA_RPC_URLS)('decodes a real UnknownProgram revert through %s', async (url) => {
    const error = await revertOf(url, { functionName: 'squeek', args: [999_999n] });
    expect(error?.kind).toBe('reverted');
    expect(error?.message).toMatch(/exist/i);
  });

  async function unfinishedProgram() {
    const [count, work] = await Promise.all([reads().uint('programCount'), reads().uint('currentWork')]);
    if (count === 0) return null;
    const [latest] = await reads().page(count - 1, 1);
    return latest !== undefined && latest.endWork > work ? latest : null;
  }

  it('derives the same hold the contract enforces', async (context) => {
    const held = await unfinishedProgram();
    if (held === null) return context.skip();
    expect((await previewQueue({ account: held.author }))?.heldUntil).toBe(held.endWork);
  });

  it.each(SEPOLIA_RPC_URLS)('decodes a real AlreadyQueued through %s', async (url) => {
    const held = await unfinishedProgram();
    if (held === null) return;
    const error = await revertOf(url, { functionName: 'submit', args: ['0x74'] }, held.author);
    expect(error?.kind).toBe('reverted');
    expect(error?.message).toContain(String(held.endWork));
  });

  it('simulates a valid submit to the next program id', async () => {
    const { result } = await simulateContract(uncached(), {
      address: contract,
      abi: TURING_WHEEL_ABI,
      account: NEVER_QUEUED,
      functionName: 'submit',
      args: ['0x74'],
    });
    expect(Number(result)).toBe(await reads().uint('programCount'));
  });
});
