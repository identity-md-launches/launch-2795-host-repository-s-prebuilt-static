import type { Address, QueuedProgram, QueueReader } from '../types';
import { TURING_WHEEL_ADDRESS } from './config';
import { PAGE_SIZE, createContractReads } from './contract-reads';
import { createEmitter } from './emitter';
import { MAX_CALLS_PER_POST, createReadClient, type ReadClientOptions } from './rpc';
import { documentVisibility, type ClockVisibility } from './visibility';

export interface QueueReaderOptions extends ReadClientOptions {
  readonly address?: Address | null;
  readonly pollMs?: number;
  readonly visibility?: ClockVisibility;
  readonly now?: () => number;
}

export interface QueueReaderHandle extends QueueReader {
  /**
   * Epoch ms of the last read that reached the chain, null until one has. While null, an empty
   * list() means "unknown", not "nothing queued".
   */
  lastSyncAt(): number | null;
}

const POLL_MS = 30_000;
const FULL_SWEEP_EVERY = 10;

const EMPTY: readonly QueuedProgram[] = [];

const INERT_READER: QueueReaderHandle = {
  list: () => EMPTY,
  refresh: async () => {},
  subscribe: () => () => {},
  stop: () => {},
  lastSyncAt: () => null,
};

function samePrograms(a: QueuedProgram, b: QueuedProgram): boolean {
  return (
    a.id === b.id &&
    a.author === b.author &&
    a.source === b.source &&
    a.startWork === b.startWork &&
    a.endWork === b.endWork &&
    a.squeeks === b.squeeks
  );
}

/** Programs are never removed on-chain, so a shorter answer is a lagging node and the tail stays. */
function merge(
  previous: readonly QueuedProgram[],
  from: number,
  fetched: readonly QueuedProgram[],
): readonly QueuedProgram[] {
  const reused = fetched.map((program) => {
    const known = previous[program.id];
    return known !== undefined && samePrograms(known, program) ? known : program;
  });
  const next = [...previous.slice(0, from), ...reused, ...previous.slice(from + fetched.length)];
  const unchanged = next.length === previous.length && next.every((program, index) => program === previous[index]);
  return unchanged ? previous : next;
}

function chunksOf<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function createQueueReader(options: QueueReaderOptions = {}): QueueReaderHandle {
  const address = options.address === undefined ? TURING_WHEEL_ADDRESS : options.address;
  if (address === null) return INERT_READER;

  const reads = createContractReads(createReadClient(options), address);
  const pollMs = options.pollMs ?? POLL_MS;
  const visibility = options.visibility ?? documentVisibility();
  const now = options.now ?? Date.now;
  const emitter = createEmitter<readonly QueuedProgram[]>();

  let programs = EMPTY;
  let syncedAt: number | null = null;
  let stopped = false;
  let polls = 0;
  let queue: Promise<void> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function sync(full: boolean): Promise<void> {
    if (stopped) return;
    const count = await reads.uint('programCount');
    const from = full ? 0 : Math.max(0, programs.length - PAGE_SIZE);
    const starts = Array.from({ length: Math.ceil(Math.max(0, count - from) / PAGE_SIZE) }, (_, page) => from + page * PAGE_SIZE);

    let fetched: readonly QueuedProgram[] = [];
    for (const batch of chunksOf(starts, MAX_CALLS_PER_POST)) {
      if (stopped) return;
      const pages = await Promise.all(batch.map((startId) => reads.page(startId)));
      fetched = [...fetched, ...pages.flat()];
    }
    if (stopped) return;

    const previous = programs;
    programs = merge(previous, from, fetched);
    syncedAt = now();
    if (programs !== previous) emitter.emit(programs);
  }

  function enqueue(full: boolean): Promise<void> {
    const run = queue.then(() => sync(full));
    queue = run.catch(() => {});
    return run;
  }

  function tick(): void {
    if (!visibility.isHidden()) {
      polls += 1;
      enqueue(polls % FULL_SWEEP_EVERY === 0).catch(() => {});
    }
    timer = setTimeout(tick, pollMs);
  }

  const unwatch = visibility.subscribe(() => {
    if (!visibility.isHidden()) enqueue(false).catch(() => {});
  });

  enqueue(true).catch(() => {});
  timer = setTimeout(tick, pollMs);

  return {
    list: () => programs,
    refresh: () => enqueue(true),
    subscribe: emitter.subscribe,
    lastSyncAt: () => syncedAt,
    stop() {
      stopped = true;
      clearTimeout(timer);
      unwatch();
      emitter.clear();
    },
  };
}
