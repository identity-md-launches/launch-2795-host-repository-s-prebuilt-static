import { SLICE_PASSES, type Preset, type QueuedProgram, type Slot } from '../types';

export function resolveSlot(work: number, queue: readonly QueuedProgram[], house: readonly Preset[]): Slot {
  const running = queue.find((program) => work >= program.startWork && work < program.endWork);
  if (running !== undefined) {
    return { kind: 'queued', program: running, t: work - running.startWork, remaining: running.endWork - work };
  }

  const slice = Math.floor(work / SLICE_PASSES);
  const index = ((slice % house.length) + house.length) % house.length;
  const preset = house[index];
  if (preset === undefined) throw new RangeError('House ROM is empty');

  const sliceEnd = (slice + 1) * SLICE_PASSES;
  const until = queue.reduce(
    (soonest, program) => (program.startWork > work && program.startWork < soonest ? program.startWork : soonest),
    sliceEnd,
  );
  return {
    kind: 'house',
    index,
    source: preset.source,
    name: preset.name,
    t: work - slice * SLICE_PASSES,
    remaining: until - work,
  };
}
