import { describe, expect, it } from 'vitest';
import { SLICE_PASSES, type Preset, type QueuedProgram, type Slot } from '../types';
import { resolveSlot } from './schedule';

const queued = (id: number, startWork: number, endWork = startWork + SLICE_PASSES): QueuedProgram => ({
  id,
  author: '0x000000000000000000000000000000000000beef',
  source: `x+${id}`,
  startWork,
  endWork,
  squeeks: 0,
});

const HOUSE: readonly Preset[] = [
  { name: 'Alpha', source: 'x', note: 'first' },
  { name: 'Beta', source: 'y', note: 'second' },
  { name: 'Gamma', source: 'r', note: 'third' },
];

const expectQueued = (slot: Slot): Extract<Slot, { kind: 'queued' }> => {
  if (slot.kind !== 'queued') throw new Error(`expected queued, got ${slot.kind}`);
  return slot;
};

const expectHouse = (slot: Slot): Extract<Slot, { kind: 'house' }> => {
  if (slot.kind !== 'house') throw new Error(`expected house, got ${slot.kind}`);
  return slot;
};

describe('queued programs', () => {
  const program = queued(7, 1000);

  it('win inside their range, with t relative to their start', () => {
    const slot = expectQueued(resolveSlot(1100, [program], HOUSE));
    expect(slot.program).toBe(program);
    expect(slot.t).toBe(100);
    expect(slot.remaining).toBe(412);
  });

  it('include the first cycle of the range', () => {
    const slot = expectQueued(resolveSlot(1000, [program], HOUSE));
    expect(slot.t).toBe(0);
    expect(slot.remaining).toBe(SLICE_PASSES);
  });

  it('exclude the end of the range', () => {
    expect(resolveSlot(1512, [program], HOUSE).kind).toBe('house');
  });

  it('do not start early', () => {
    expect(resolveSlot(999.999, [program], HOUSE).kind).toBe('house');
  });

  it('carry fractional work into t and remaining', () => {
    const slot = expectQueued(resolveSlot(1000.5, [program], HOUSE));
    expect(slot.t).toBe(0.5);
    expect(slot.remaining).toBe(511.5);
  });

  it('hold until the very last fraction of the slice', () => {
    expect(expectQueued(resolveSlot(1511.75, [program], HOUSE)).remaining).toBe(0.25);
  });

  it('hand over directly when back to back', () => {
    const next = queued(8, 1512);
    const slot = expectQueued(resolveSlot(1512, [program, next], HOUSE));
    expect(slot.program).toBe(next);
    expect(slot.t).toBe(0);
  });

  it('are found anywhere in the list', () => {
    const list = [queued(1, 0), queued(2, 512), queued(3, 5000), queued(4, 9000)];
    expect(expectQueued(resolveSlot(5001, list, HOUSE)).program.id).toBe(3);
    expect(expectQueued(resolveSlot(9001, list, HOUSE)).program.id).toBe(4);
  });

  it('beat the house ROM wherever the house slice happens to be', () => {
    expect(resolveSlot(2047, [queued(1, 2000)], HOUSE).kind).toBe('queued');
    expect(resolveSlot(2048, [queued(1, 2000)], HOUSE).kind).toBe('queued');
  });
});

describe('the house ROM', () => {
  it('fills an empty queue from the first preset at work zero', () => {
    expect(resolveSlot(0, [], HOUSE)).toEqual({
      kind: 'house',
      index: 0,
      source: 'x',
      name: 'Alpha',
      t: 0,
      remaining: SLICE_PASSES,
    });
  });

  it('picks the slice by floored division', () => {
    expect(expectHouse(resolveSlot(511, [], HOUSE)).index).toBe(0);
    expect(expectHouse(resolveSlot(511.999, [], HOUSE)).index).toBe(0);
    expect(expectHouse(resolveSlot(512, [], HOUSE)).index).toBe(1);
    expect(expectHouse(resolveSlot(1024, [], HOUSE)).index).toBe(2);
  });

  it('wraps around the list', () => {
    expect(expectHouse(resolveSlot(512 * 3, [], HOUSE)).index).toBe(0);
    expect(expectHouse(resolveSlot(512 * 7 + 3, [], HOUSE)).index).toBe(1);
  });

  it('sets t to work mod SLICE, keeping the fraction', () => {
    const slot = expectHouse(resolveSlot(512 * 5 + 100.25, [], HOUSE));
    expect(slot.t).toBe(100.25);
    expect(slot.remaining).toBe(411.75);
  });

  it('copies the preset identity into the slot', () => {
    const slot = expectHouse(resolveSlot(512, [], HOUSE));
    expect(slot.name).toBe('Beta');
    expect(slot.source).toBe('y');
  });

  it('ignores queue entries that already ended', () => {
    expect(resolveSlot(5000, [queued(1, 0)], HOUSE).kind).toBe('house');
  });

  it('counts remaining down to the next queued start when that comes first', () => {
    const slot = expectHouse(resolveSlot(600, [queued(1, 700)], HOUSE));
    expect(slot.t).toBe(88);
    expect(slot.remaining).toBe(100);
  });

  it('ignores queued starts beyond the end of the house slice', () => {
    expect(expectHouse(resolveSlot(600, [queued(1, 5000)], HOUSE)).remaining).toBe(424);
  });

  it('refuses an empty house list, which would leave nothing to run', () => {
    expect(() => resolveSlot(0, [], [])).toThrow(RangeError);
  });
});

describe('agreement between viewers', () => {
  it('gives the same answer for equal inputs at millions of cycles', () => {
    const queue = [queued(1, 7_000_000)];
    const a = resolveSlot(7_000_123.5, queue, HOUSE);
    const b = resolveSlot(7_000_123.5, [...queue], [...HOUSE]);
    expect(a).toEqual(b);
    expect(expectQueued(a).t).toBe(123.5);
  });

  it('does not depend on the order viewers received the queue', () => {
    const queue = [queued(1, 1000), queued(2, 2000), queued(3, 3000)];
    expect(resolveSlot(2500, queue, HOUSE)).toEqual(resolveSlot(2500, [...queue].reverse(), HOUSE));
    expect(resolveSlot(600, queue, HOUSE)).toEqual(resolveSlot(600, [...queue].reverse(), HOUSE));
  });
});
