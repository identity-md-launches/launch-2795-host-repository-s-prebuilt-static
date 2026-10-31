import { resolveSlot } from '../../machine/schedule';
import { SLICE_PASSES, type Preset, type QueuedProgram, type Slot } from '../../types';

export interface SliceView {
  readonly key: string;
  readonly start: number;
  readonly end: number;
  readonly slot: Slot;
  readonly source: string;
}

function view(slot: Slot, start: number, end: number): SliceView {
  return slot.kind === 'queued'
    ? { key: `q${slot.program.id}`, start, end, slot, source: slot.program.source }
    : { key: `h${Math.floor(start / SLICE_PASSES)}`, start, end, slot, source: slot.source };
}

function nextQueuedStart(work: number, programs: readonly QueuedProgram[]): number {
  return programs.reduce(
    (nearest, program) => (program.startWork > work && program.startWork < nearest ? program.startWork : nearest),
    Number.POSITIVE_INFINITY,
  );
}

function prevQueuedEnd(work: number, programs: readonly QueuedProgram[]): number {
  return programs.reduce(
    (nearest, program) => (program.endWork <= work && program.endWork > nearest ? program.endWork : nearest),
    Number.NEGATIVE_INFINITY,
  );
}

/** The slice that owns this cycle, trimmed where a queued program cuts a house slice short. */
export function sliceAt(work: number, programs: readonly QueuedProgram[], house: readonly Preset[]): SliceView {
  const cycle = Math.floor(work);
  const slot = resolveSlot(cycle, programs, house);
  const rawStart = cycle - Math.floor(slot.t);
  const rawEnd = cycle + Math.max(1, Math.ceil(slot.remaining));
  if (slot.kind === 'queued') return view(slot, rawStart, rawEnd);
  return view(
    slot,
    Math.max(rawStart, prevQueuedEnd(cycle, programs)),
    Math.min(rawEnd, nextQueuedStart(cycle, programs)),
  );
}

export function upcoming(
  work: number,
  programs: readonly QueuedProgram[],
  house: readonly Preset[],
  count: number,
): readonly SliceView[] {
  const slices: SliceView[] = [];
  let cursor = Math.floor(work);
  for (let n = 0; n < count; n++) {
    const slice = sliceAt(cursor, programs, house);
    slices.push(slice);
    cursor = slice.end;
  }
  return slices;
}

export function history(
  work: number,
  programs: readonly QueuedProgram[],
  house: readonly Preset[],
  count: number,
): readonly SliceView[] {
  const slices: SliceView[] = [];
  let cursor = sliceAt(work, programs, house).start;
  for (let n = 0; n < count && cursor > 0; n++) {
    const slice = sliceAt(cursor - 1, programs, house);
    slices.push(slice);
    cursor = slice.start;
  }
  return slices;
}
