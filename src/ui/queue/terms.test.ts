import { describe, expect, it } from 'vitest';
import type { QueuePreview } from '../../chain/preview';
import type { HamsterReading } from '../../types';
import { describeTerms, queueTerms } from './terms';

const preview = (over: Partial<QueuePreview> = {}): QueuePreview => ({
  startWork: 59798,
  endWork: 60310,
  waitCycles: 1280,
  currentWork: 58518,
  heldUntil: null,
  ...over,
});

const reading = (state: HamsterReading['state'], hz: number): HamsterReading => ({
  work: 1000, hz, rpm: hz * 60, state, observedAt: 1, nextLiveAt: null,
});

describe('queue terms', () => {
  it('counts the wait from live work, because waitCycles overstates it while he runs', () => {
    expect(queueTerms(preview(), 59000.7)).toEqual({ kind: 'open', startsIn: 798 });
  });

  it('falls back to the settled wait before the first telemetry', () => {
    expect(queueTerms(preview(), null)).toEqual({ kind: 'open', startsIn: 1280 });
  });

  it('never reports a negative wait when live work has passed the start', () => {
    expect(queueTerms(preview(), 60000)).toEqual({ kind: 'open', startsIn: 0 });
  });

  it('stays held after live work passes heldUntil, until the contract says otherwise', () => {
    expect(queueTerms(preview({ heldUntil: 59000 }), 58000)).toEqual({ kind: 'held', clearsAt: 59000, settling: false });
    expect(queueTerms(preview({ heldUntil: 59000 }), 59500)).toEqual({ kind: 'held', clearsAt: 59000, settling: true });
  });

  it('opens only when the preview clears the hold', () => {
    expect(queueTerms(preview({ heldUntil: null }), 59500).kind).toBe('open');
  });

  it('gives a duration only while he is really running', () => {
    const terms = { kind: 'open', startsIn: 768 } as const;
    expect(describeTerms(terms, reading('running', 0.85))).toBe('STARTS IN ABOUT 768 CYCLES, ABOUT 15 MIN OF RUNNING.');
    expect(describeTerms(terms, reading('asleep', 0))).toBe('STARTS IN ABOUT 768 CYCLES. RUNS WHEN HE WAKES.');
    expect(describeTerms(terms, reading('signal-lost', 0))).toBe('STARTS IN ABOUT 768 CYCLES.');
    expect(describeTerms(terms, null)).toBe('STARTS IN ABOUT 768 CYCLES.');
  });

  it('names the cycle a hold clears at, and says when only settlement is left', () => {
    expect(describeTerms({ kind: 'held', clearsAt: 59030, settling: false }, null)).toBe(
      'YOU ALREADY HAVE A PROGRAM QUEUED. ONE AT A TIME. CLEARS AT CYCLE 59,030.',
    );
    expect(describeTerms({ kind: 'held', clearsAt: 59030, settling: true }, null)).toContain('STILL SETTLING');
  });
});
