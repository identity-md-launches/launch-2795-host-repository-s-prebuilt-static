import { describe, expect, it, vi } from 'vitest';
import type { Address } from '../types';
import { previewQueue } from './preview';
import { chainProgram, fakeRpc, type ChainProgram, type ChainViews } from './test-helpers';

const CONTRACT: Address = '0x1111111111111111111111111111111111111111';
const AUTHOR: Address = '0x00000000000000000000000000000000000000AA';
const STRANGER: Address = '0x00000000000000000000000000000000000000bb';

let testNumber = 0;
const uniqueUrls = () => {
  testNumber += 1;
  return [`https://preview-rpc-${testNumber}.test/`];
};

const views = (overrides: Partial<ChainViews> = {}): ChainViews => ({
  queueEnd: 0n,
  currentWork: 58_518n,
  lead: 768n,
  ...overrides,
});

const program = (endWork: bigint, author: Address = AUTHOR): ChainProgram => ({
  ...chainProgram(0),
  author,
  startWork: endWork - 512n,
  endWork,
});

function preview(
  chainViews: ChainViews,
  programs: readonly ChainProgram[] = [],
  options: { account?: Address } = {},
) {
  const rpc = fakeRpc(() => programs, () => false, () => undefined, () => chainViews);
  return {
    rpc,
    result: previewQueue({ address: CONTRACT, urls: uniqueUrls(), fetch: rpc.fetch, ...options }),
  };
}

const pageCalls = (rpc: ReturnType<typeof fakeRpc>) => rpc.calls.filter((call) => call.functionName === 'page');

describe('where a submit would land', () => {
  it.each<[string, Partial<ChainViews>, number, number, number]>([
    ['an empty queue waits LEAD past settled work', {}, 59_286, 59_798, 768],
    ['a queue tail far ahead wins', { queueEnd: 60_000n }, 60_000, 60_512, 1_482],
    ['a tail inside LEAD leaves a gap', { queueEnd: 58_600n }, 59_286, 59_798, 768],
    ['a tail exactly at LEAD lands on it', { queueEnd: 59_286n }, 59_286, 59_798, 768],
    ['a tail one past LEAD lands on it', { queueEnd: 59_287n }, 59_287, 59_799, 769],
  ])('%s', async (_name, overrides, startWork, endWork, waitCycles) => {
    expect(await preview(views(overrides)).result).toEqual({
      startWork,
      endWork,
      waitCycles,
      currentWork: 58_518,
      heldUntil: null,
    });
  });

  it('uses the LEAD the contract reports, not an assumed one', async () => {
    const { startWork } = (await preview(views({ lead: 100n })).result) ?? { startWork: 0 };
    expect(startWork).toBe(58_618);
  });
});

describe('whether the wallet holds a program', () => {
  const work = views({ currentWork: 1_000n, queueEnd: 1_500n });

  it('reports the cycle an unfinished program clears at', async () => {
    const { result } = preview(work, [program(1_500n)], { account: AUTHOR });
    expect((await result)?.heldUntil).toBe(1_500);
  });

  it('matches the account regardless of address casing', async () => {
    const { result } = preview(work, [program(1_500n)], { account: AUTHOR.toLowerCase() as Address });
    expect((await result)?.heldUntil).toBe(1_500);
  });

  it('frees the wallet the moment settled work reaches endWork, as the contract does', async () => {
    const { result } = preview(work, [program(1_000n)], { account: AUTHOR });
    expect((await result)?.heldUntil).toBeNull();
  });

  it('still holds one cycle before that', async () => {
    const { result } = preview(work, [program(1_001n)], { account: AUTHOR });
    expect((await result)?.heldUntil).toBe(1_001);
  });

  it('ignores an unfinished program by someone else', async () => {
    const { result } = preview(work, [program(1_500n, STRANGER)], { account: AUTHOR });
    expect((await result)?.heldUntil).toBeNull();
  });

  it('reports the newest of several programs by the same author', async () => {
    const { result } = preview(work, [program(900n), program(1_200n), program(1_500n, STRANGER)], { account: AUTHOR });
    expect((await result)?.heldUntil).toBe(1_200);
  });

  it('finds a hold more than one page back in a long queue', async () => {
    const programs = Array.from({ length: 120 }, (_, index) =>
      program(BigInt(1_100 + index), index === 10 ? AUTHOR : STRANGER),
    );
    const { rpc, result } = preview(views({ currentWork: 1_000n }), programs, { account: AUTHOR });
    expect((await result)?.heldUntil).toBe(1_110);
    expect(pageCalls(rpc).map((call) => call.args)).toEqual([[70n, 50n], [20n, 50n], [0n, 20n]]);
  });

  it('stops reading as soon as it reaches a finished program', async () => {
    const programs = Array.from({ length: 200 }, (_, index) => program(BigInt(1_000 + index), STRANGER));
    const { rpc, result } = preview(views({ currentWork: 1_197n }), programs, { account: AUTHOR });
    expect((await result)?.heldUntil).toBeNull();
    expect(pageCalls(rpc)).toHaveLength(1);
  });

  it('survives a lagging node that returns an empty page', async () => {
    const rpc = fakeRpc(
      () => [],
      () => false,
      (request) => {
        const data = (request.params[0] as { data?: string } | undefined)?.data ?? '';
        const answersCount = request.method === 'eth_call' && data.startsWith('0x9f796634');
        return answersCount ? { result: `0x${'3'.padStart(64, '0')}` } : undefined;
      },
      () => views(),
    );
    const result = await previewQueue({ address: CONTRACT, urls: uniqueUrls(), fetch: rpc.fetch, account: AUTHOR });
    expect(result?.heldUntil).toBeNull();
  });

  it('reads no programs when no account is given', async () => {
    const { rpc, result } = preview(work, [program(1_500n)]);
    expect((await result)?.heldUntil).toBeNull();
    expect(rpc.calls.map((call) => call.functionName).sort()).toEqual(['LEAD', 'currentWork', 'queueEnd']);
  });
});

describe('failure', () => {
  it('resolves null with no network when no contract is configured', async () => {
    const network = vi.fn() as unknown as typeof fetch;
    expect(await previewQueue({ address: null, urls: uniqueUrls(), fetch: network })).toBeNull();
    expect(network).not.toHaveBeenCalled();
  });

  it('rejects rather than inventing a slot when every RPC is down', async () => {
    const rpc = fakeRpc(() => [], () => true);
    await expect(previewQueue({ address: CONTRACT, urls: uniqueUrls(), fetch: rpc.fetch })).rejects.toThrow();
  });
});
