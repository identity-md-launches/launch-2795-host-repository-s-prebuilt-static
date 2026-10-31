import { SLICE_PASSES, type Address } from '../types';
import { TURING_WHEEL_ADDRESS } from './config';
import { PAGE_SIZE, createContractReads, type ContractReads } from './contract-reads';
import { createReadClient, type ReadClientOptions } from './rpc';

export interface QueuePreviewOptions extends ReadClientOptions {
  readonly address?: Address | null;
  /** Without it, heldUntil is always null. */
  readonly account?: Address;
}

export interface QueuePreview {
  /** The cycle a submit sent now would start at. A snapshot: someone else may queue first. */
  readonly startWork: number;
  readonly endWork: number;
  /** startWork minus settled work. For a live countdown use startWork minus reading.work. */
  readonly waitCycles: number;
  /** The contract's settled work, which lags telemetry. */
  readonly currentWork: number;
  /**
   * The cycle this account's unfinished program clears at, null when it may queue. Gate on this and
   * never on telemetry: settled work can reach this cycle about 11 minutes after live work does.
   */
  readonly heldUntil: number | null;
}

/**
 * lastEndWork is private, so this reads it from the programs. endWork only ever rises, so unfinished
 * programs are a suffix of the list and the walk back can stop at the first finished one.
 */
async function findHold(reads: ContractReads, account: string, end: number, work: number): Promise<number | null> {
  if (end <= 0) return null;
  const start = Math.max(0, end - PAGE_SIZE);
  const newestFirst = [...(await reads.page(start, end - start))].reverse();
  for (const program of newestFirst) {
    if (program.endWork <= work) return null;
    if (program.author.toLowerCase() === account) return program.endWork;
  }
  return findHold(reads, account, start, work);
}

/** What a submit would get, before anyone signs. Rejects on RPC failure, null with no contract set. */
export async function previewQueue(options: QueuePreviewOptions = {}): Promise<QueuePreview | null> {
  const address = options.address === undefined ? TURING_WHEEL_ADDRESS : options.address;
  if (address === null) return null;

  const reads = createContractReads(createReadClient(options), address);
  const { account } = options;
  const [queueEnd, currentWork, lead, count] = await Promise.all([
    reads.uint('queueEnd'),
    reads.uint('currentWork'),
    reads.uint('LEAD'),
    account === undefined ? 0 : reads.uint('programCount'),
  ]);
  const startWork = Math.max(queueEnd, currentWork + lead);
  const heldUntil = account === undefined ? null : await findHold(reads, account.toLowerCase(), count, currentWork);
  return { startWork, endWork: startWork + SLICE_PASSES, waitCycles: startWork - currentWork, currentWork, heldUntil };
}
