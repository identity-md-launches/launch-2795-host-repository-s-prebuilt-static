import { describe, expect, it } from 'vitest';
import { CELLS, COLS, createFrame } from '../types';
import { frameToCover } from './cover';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXY';

// Same arithmetic as squeekchain-tasks/cover.mjs, kept verbatim so a drift here fails loudly.
const referenceEncoder = (cells: readonly number[]): string =>
  Array.from({ length: cells.length / 2 }, (_, index) => {
    const first = Math.min(4, cells[index * 2]!);
    const second = Math.min(4, cells[index * 2 + 1]!);
    return ALPHABET[first * 5 + second];
  }).join('');

describe('frameToCover', () => {
  it('is 1152 characters for a full frame', () => {
    expect(frameToCover(createFrame())).toHaveLength(1152);
  });

  it('stays in the Squeekchain alphabet for every level', () => {
    const frame = createFrame().map((_, k) => (k % 9) - 4);
    expect(frameToCover(frame)).toMatch(/^[A-Y]{1152}$/);
  });

  it('encodes a dark frame as all A', () => {
    expect(frameToCover(createFrame())).toBe('A'.repeat(1152));
  });

  it('encodes a fully lit frame as all Y', () => {
    expect(frameToCover(createFrame().fill(4))).toBe('Y'.repeat(1152));
  });

  it('uses the absolute level, so blue encodes like gold', () => {
    const frame = createFrame().map((_, k) => ((k * 7) % 9) - 4);
    expect(frameToCover(frame)).toBe(frameToCover(frame.map(Math.abs)));
  });

  it('packs the first cell as the high digit', () => {
    const frame = createFrame();
    frame[0] = 2;
    frame[1] = 3;
    expect(frameToCover(frame)[0]).toBe(ALPHABET[2 * 5 + 3]);
  });

  it('runs row-major', () => {
    const frame = createFrame();
    frame[COLS] = 4;
    const cover = frameToCover(frame);
    expect(cover[COLS / 2]).toBe(ALPHABET[4 * 5]);
    expect(cover.replaceAll('A', '')).toHaveLength(1);
  });

  it('reaches the last cell', () => {
    const frame = createFrame();
    frame[CELLS - 1] = 1;
    expect(frameToCover(frame).at(-1)).toBe(ALPHABET[1]);
  });

  it('matches the reference encoder on arbitrary frames', () => {
    let state = 12345;
    const next = (): number => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state;
    };
    for (let round = 0; round < 50; round += 1) {
      const cells = Array.from({ length: CELLS }, () => next() % 5);
      expect(frameToCover(Int8Array.from(cells))).toBe(referenceEncoder(cells));
    }
  });
});
