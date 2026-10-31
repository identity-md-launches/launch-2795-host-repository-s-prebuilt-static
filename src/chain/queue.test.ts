import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueuedProgram } from '../types';
import { createQueueReader, type QueueReaderHandle } from './queue';
import { chainProgram, fakeRpc, type ChainProgram } from './test-helpers';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const POLL_MS = 5;

/** viem pools pending batches per URL across clients, so tests sharing a URL would share a batch. */
let urls: readonly [string, string];
let testNumber = 0;

const readers: QueueReaderHandle[] = [];
function reader(rpcFetch: typeof fetch, options: Partial<Parameters<typeof createQueueReader>[0]> = {}) {
  const queue = createQueueReader({ address: ADDRESS, urls, fetch: rpcFetch, pollMs: 60_000, ...options });
  readers.push(queue);
  return queue;
}
const programsOf = (count: number) => Array.from({ length: count }, (_, index) => chainProgram(index));
const PAGE_SELECTOR = 'ebb9e69c';

/** Answers from the chain as it is now, but delivers the response only when released. */
function heldResponses(inner: typeof fetch) {
  let shouldHold: (init: RequestInit | undefined) => boolean = () => false;
  let opened = () => {};
  let opening = new Promise<void>((resolve) => {
    opened = resolve;
  });
  let waiting = 0;
  const heldFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await inner(input, init);
    if (shouldHold(init)) {
      waiting += 1;
      await opening;
      waiting -= 1;
    }
    return response;
  }) as typeof fetch;
  return {
    fetch: heldFetch,
    hold(predicate: (init: RequestInit | undefined) => boolean) {
      shouldHold = predicate;
    },
    waiting: () => waiting,
    release() {
      shouldHold = () => false;
      opened();
      opening = new Promise<void>((resolve) => {
        opened = resolve;
      });
    },
  };
}

const pageCalls = (rpc: ReturnType<typeof fakeRpc>) => rpc.calls.filter((call) => call.functionName === 'page');
const synced = (queue: QueueReaderHandle) => vi.waitFor(() => expect(queue.lastSyncAt()).not.toBeNull());

beforeEach(() => {
  testNumber += 1;
  urls = [`https://rpc-a-${testNumber}.test/`, `https://rpc-b-${testNumber}.test/`];
});

afterEach(() => {
  readers.splice(0).forEach((queue) => queue.stop());
  vi.useRealTimers();
});

describe('before deployment', () => {
  it('stays empty and silent with no network calls and no timers', async () => {
    vi.useFakeTimers();
    const network = vi.fn() as unknown as typeof fetch;
    const queue = reader(network, { address: null, pollMs: POLL_MS });
    const seen: unknown[] = [];
    queue.subscribe((programs) => seen.push(programs));

    await queue.refresh();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(queue.list()).toEqual([]);
    expect(queue.lastSyncAt()).toBeNull();
    expect(seen).toEqual([]);
    expect(network).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('reading', () => {
  it('decodes programs into the shared shape', async () => {
    const rpc = fakeRpc(() => [chainProgram(0, 'sin(x+t)>.5', 3)]);
    const queue = reader(rpc.fetch);
    await synced(queue);
    expect(queue.list()).toEqual<QueuedProgram[]>([
      {
        id: 0,
        author: '0x00000000000000000000000000000000000000AA',
        source: 'sin(x+t)>.5',
        startWork: 58000,
        endWork: 58512,
        squeeks: 3,
      },
    ]);
  });

  it('pages through the whole queue, oldest first, numbering from zero', async () => {
    const rpc = fakeRpc(() => programsOf(120));
    const queue = reader(rpc.fetch);
    await synced(queue);

    expect(queue.list().map((program) => program.id)).toEqual(Array.from({ length: 120 }, (_, id) => id));
    expect(queue.list()[119]?.source).toBe('t+119');
    expect(pageCalls(rpc).map((call) => call.args)).toEqual([[0n, 50n], [50n, 50n], [100n, 50n]]);
  });

  it('batches pages instead of sending one POST each', async () => {
    const rpc = fakeRpc(() => programsOf(300));
    const queue = reader(rpc.fetch);
    await synced(queue);

    expect(pageCalls(rpc)).toHaveLength(6);
    const pagePosts = rpc.posts.filter((post) => post.methods.length > 1);
    expect(pagePosts.map((post) => post.methods.length)).toEqual([4, 2]);
  });

  it('caps how many pages travel in one POST', async () => {
    const rpc = fakeRpc(() => programsOf(1_000));
    const queue = reader(rpc.fetch);
    await synced(queue);

    expect(queue.list()).toHaveLength(1_000);
    expect(Math.max(...rpc.posts.map((post) => post.methods.length))).toBe(4);
  });

  it('makes no page call for an empty queue', async () => {
    const rpc = fakeRpc(() => []);
    const queue = reader(rpc.fetch);
    await synced(queue);
    expect(queue.list()).toEqual([]);
    expect(pageCalls(rpc)).toEqual([]);
  });

  it('falls back to the next RPC when the first is down', async () => {
    const rpc = fakeRpc(() => programsOf(2), (url) => url === urls[0]);
    const queue = reader(rpc.fetch);
    await synced(queue);
    expect(queue.list()).toHaveLength(2);
    expect(rpc.posts.map((post) => post.url)).toContain(urls[1]);
    expect(rpc.posts.map((post) => post.url)).not.toContain(urls[0]);
  });
});

describe('polling', () => {
  it('picks up a new program and notifies', async () => {
    let chain: readonly ChainProgram[] = programsOf(2);
    const rpc = fakeRpc(() => chain);
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);
    const seen: (readonly QueuedProgram[])[] = [];
    queue.subscribe((programs) => seen.push(programs));

    chain = programsOf(3);
    await vi.waitFor(() => expect(queue.list()).toHaveLength(3));
    expect(seen.at(-1)).toHaveLength(3);
  });

  it('picks up a squeek on a recent program', async () => {
    let chain: readonly ChainProgram[] = programsOf(2);
    const rpc = fakeRpc(() => chain);
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);

    chain = [chainProgram(0), chainProgram(1, 't+1', 9)];
    await vi.waitFor(() => expect(queue.list()[1]?.squeeks).toBe(9));
  });

  it('does not notify or rebuild the list when nothing changed', async () => {
    const rpc = fakeRpc(() => programsOf(2));
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);
    const before = queue.list();
    const seen: unknown[] = [];
    queue.subscribe((programs) => seen.push(programs));
    const reads = rpc.calls.length;

    await vi.waitFor(() => expect(rpc.calls.length).toBeGreaterThan(reads + 6));
    expect(seen).toEqual([]);
    expect(queue.list()).toBe(before);
  });

  it('keeps unchanged program objects when one program changes', async () => {
    let chain: readonly ChainProgram[] = programsOf(3);
    const rpc = fakeRpc(() => chain);
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);
    const first = queue.list()[0];

    chain = [chainProgram(0), chainProgram(1), chainProgram(2, 't+2', 1)];
    await vi.waitFor(() => expect(queue.list()[2]?.squeeks).toBe(1));
    expect(queue.list()[0]).toBe(first);
  });

  it('reads only the tail on routine polls', async () => {
    const rpc = fakeRpc(() => programsOf(200));
    const queue = reader(rpc.fetch, { pollMs: 40 });
    await vi.waitFor(() => expect(queue.lastSyncAt()).not.toBeNull(), { interval: 1 });
    rpc.calls.length = 0;

    await vi.waitFor(() => expect(pageCalls(rpc).length).toBeGreaterThan(0), { interval: 1 });
    expect(pageCalls(rpc)[0]?.args).toEqual([150n, 50n]);
  });

  it('sweeps old programs now and then so their squeeks stay honest', async () => {
    let chain: readonly ChainProgram[] = programsOf(200);
    const rpc = fakeRpc(() => chain);
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);

    chain = chain.map((program, index) => (index === 3 ? { ...program, squeeks: 4 } : program));
    await vi.waitFor(() => expect(queue.list()[3]?.squeeks).toBe(4), { timeout: 2_000 });
  });

  it('keeps the last list through failed polls and recovers', async () => {
    let down = false;
    let refused = 0;
    const rpc = fakeRpc(() => programsOf(2), () => {
      if (down) refused += 1;
      return down;
    });
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);
    const syncedAt = queue.lastSyncAt();

    down = true;
    await vi.waitFor(() => expect(refused).toBeGreaterThan(12), { timeout: 3_000 });
    expect(queue.list()).toHaveLength(2);
    expect(queue.lastSyncAt()).toBe(syncedAt);

    down = false;
    await vi.waitFor(() => expect(queue.lastSyncAt()).toBeGreaterThan(syncedAt ?? 0), { timeout: 3_000 });
  });

  it('skips reads while hidden', async () => {
    const rpc = fakeRpc(() => programsOf(1));
    const queue = reader(rpc.fetch, {
      pollMs: POLL_MS,
      visibility: { isHidden: () => true, subscribe: () => () => {} },
    });
    await synced(queue);
    rpc.calls.length = 0;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(rpc.calls).toEqual([]);
  });

  it('catches up as soon as the tab returns, without waiting for the next poll', async () => {
    let hidden = true;
    let wake = () => {};
    const rpc = fakeRpc(() => programsOf(1));
    const queue = reader(rpc.fetch, {
      pollMs: 60_000,
      visibility: {
        isHidden: () => hidden,
        subscribe: (listener) => {
          wake = listener;
          return () => {};
        },
      },
    });
    await synced(queue);
    rpc.calls.length = 0;

    hidden = false;
    wake();
    await vi.waitFor(() => expect(rpc.calls.length).toBeGreaterThan(0));
  });

  it('never shrinks when a lagging node reports fewer programs', async () => {
    let chain: readonly ChainProgram[] = programsOf(3);
    const rpc = fakeRpc(() => chain);
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);

    chain = programsOf(2);
    const reads = rpc.calls.length;
    await vi.waitFor(() => expect(rpc.calls.length).toBeGreaterThan(reads + 3));
    expect(queue.list()).toHaveLength(3);
  });

  it('stops reading', async () => {
    const rpc = fakeRpc(() => programsOf(2));
    const queue = reader(rpc.fetch, { pollMs: POLL_MS });
    await synced(queue);
    queue.stop();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const reads = rpc.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(rpc.calls).toHaveLength(reads);
  });

  it('stops paging part way through a long queue', async () => {
    const rpc = fakeRpc(() => programsOf(1_000));
    const gate = heldResponses(rpc.fetch);
    gate.hold((init) => String(init?.body).includes(PAGE_SELECTOR));
    const queue = reader(gate.fetch);
    await vi.waitFor(() => expect(gate.waiting()).toBeGreaterThan(0));
    const pagesBeforeStop = pageCalls(rpc).length;

    queue.stop();
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(pagesBeforeStop).toBe(4);
    expect(pageCalls(rpc)).toHaveLength(4);
  });

  it('ignores a read that lands after stop', async () => {
    const rpc = fakeRpc(() => programsOf(2));
    const gate = heldResponses(rpc.fetch);
    gate.hold((init) => String(init?.body).includes(PAGE_SELECTOR));
    const queue = reader(gate.fetch);
    const seen: unknown[] = [];
    queue.subscribe((programs) => seen.push(programs));
    await vi.waitFor(() => expect(gate.waiting()).toBeGreaterThan(0));

    queue.stop();
    gate.release();
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(queue.list()).toEqual([]);
    expect(seen).toEqual([]);
    expect(queue.lastSyncAt()).toBeNull();
  });
});

describe('refresh', () => {
  it('re-reads old programs too, for the squeek a viewer just sent', async () => {
    let chain: readonly ChainProgram[] = programsOf(200);
    const rpc = fakeRpc(() => chain);
    const queue = reader(rpc.fetch);
    await synced(queue);

    chain = chain.map((program, index) => (index === 3 ? { ...program, squeeks: 1 } : program));
    await queue.refresh();
    expect(queue.list()[3]?.squeeks).toBe(1);
  });

  it('rejects when every RPC is down, leaving the list alone', async () => {
    let down = false;
    const rpc = fakeRpc(() => programsOf(2), () => down);
    const queue = reader(rpc.fetch);
    await synced(queue);

    down = true;
    await expect(queue.refresh()).rejects.toThrow();
    expect(queue.list()).toHaveLength(2);
  });

  it('never lets a slow old read overwrite a newer one', async () => {
    let chain: readonly ChainProgram[] = programsOf(1);
    const rpc = fakeRpc(() => chain);
    const gate = heldResponses(rpc.fetch);
    const queue = reader(gate.fetch);
    await synced(queue);

    gate.hold((init) => String(init?.body).includes(PAGE_SELECTOR));
    const older = queue.refresh();
    await vi.waitFor(() => expect(gate.waiting()).toBe(1));

    gate.hold(() => false);
    chain = [chainProgram(0, 't+0', 5)];
    const newer = queue.refresh();
    await new Promise((resolve) => setTimeout(resolve, 40));
    gate.release();
    await Promise.all([older, newer]);

    expect(queue.list()[0]?.squeeks).toBe(5);
  });
});
