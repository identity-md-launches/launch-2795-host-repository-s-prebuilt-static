import type { QueuePreview } from '../../chain/preview';
import type { HamsterReading } from '../../types';
import { cycles } from '../format';

export type QueueTerms =
  | { readonly kind: 'open'; readonly startsIn: number }
  | { readonly kind: 'held'; readonly clearsAt: number; readonly settling: boolean };

/**
 * Only the preview may decide a hold: settled work reaches heldUntil about 11 minutes after live
 * work does, and the contract refuses until then. Live work only makes the wait read true.
 * Pass null for work before the first telemetry.
 */
export function queueTerms(preview: QueuePreview, work: number | null): QueueTerms {
  if (preview.heldUntil !== null) {
    return { kind: 'held', clearsAt: preview.heldUntil, settling: work !== null && work >= preview.heldUntil };
  }
  const startsIn = work === null ? preview.waitCycles : Math.max(0, preview.startWork - Math.floor(work));
  return { kind: 'open', startsIn };
}

function minutesOfRunning(startsIn: number, hz: number): string {
  const minutes = Math.round(startsIn / hz / 60);
  return minutes < 1 ? 'UNDER A MINUTE' : `ABOUT ${minutes} MIN`;
}

/** A preview is a snapshot and someone else can queue first, so every wait says "about". */
export function describeTerms(terms: QueueTerms, reading: HamsterReading | null): string {
  if (terms.kind === 'held') {
    return terms.settling
      ? 'YOUR PROGRAM HAS RUN. THE CHAIN IS STILL SETTLING, THEN THE QUEUE REOPENS FOR YOU.'
      : `YOU ALREADY HAVE A PROGRAM QUEUED. ONE AT A TIME. CLEARS AT CYCLE ${cycles(terms.clearsAt)}.`;
  }
  const wait = `STARTS IN ABOUT ${cycles(terms.startsIn)} CYCLES`;
  if (reading?.state === 'running' && reading.hz > 0) {
    return `${wait}, ${minutesOfRunning(terms.startsIn, reading.hz)} OF RUNNING.`;
  }
  if (reading?.state === 'asleep') return `${wait}. RUNS WHEN HE WAKES.`;
  return `${wait}.`;
}
