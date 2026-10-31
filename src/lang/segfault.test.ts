import { describe, expect, it } from 'vitest';
import { COLS, createFrame, type Frame } from '../types';
import { segfaultProgram } from './index';

const frameAt = (t: number): Frame => {
  const out = createFrame();
  segfaultProgram.render(t, out);
  return out;
};

const sameFrame = (a: Frame, b: Frame): boolean => a.every((value, k) => value === b[k]);

// S, E, G, F, A, U, L, T, 5 by 7 with a one column gap, drawn at double height from column 8.
const WORD = [
  '.####.#####..####.#####..###..#...#.#.....#####',
  '#.....#.....#.....#.....#...#.#...#.#.......#..',
  '#.....#.....#.....#.....#...#.#...#.#.......#..',
  '.###..####..#..##.####..#####.#...#.#.......#..',
  '....#.#.....#...#.#.....#...#.#...#.#.......#..',
  '....#.#.....#...#.#.....#...#.#...#.#.......#..',
  '####..#####..####.#.....#...#..###..#####...#..',
];
const WORD_LEFT = 8;
const WORD_TOP = 9;

const wordMatches = (frame: Frame): boolean =>
  WORD.every((row, line) =>
    [...row].every((mark, column) =>
      [0, 1].every((half) => {
        const level = frame[(WORD_TOP + line * 2 + half) * COLS + WORD_LEFT + column]!;
        return mark === '#' ? level === 4 : level <= 0;
      }),
    ),
  );

const TICKS = Array.from({ length: 512 * 4 }, (_, k) => k / 4);

describe('segfaultProgram', () => {
  it('is deterministic', () => {
    [0, 1.5, 33.25, 511.75, 100000.5].forEach((t) => {
      expect(frameAt(t)).toEqual(frameAt(t));
    });
  });

  it('spells SEGFAULT cleanly often enough to be read', () => {
    const calm = TICKS.filter((t) => wordMatches(frameAt(t)));
    expect(calm.length).toBeGreaterThan(TICKS.length * 0.3);
  });

  it('never freezes for long', () => {
    let longest = 0;
    let run = 0;
    TICKS.slice(1).forEach((t, k) => {
      run = sameFrame(frameAt(t), frameAt(TICKS[k]!)) ? run + 1 : 0;
      longest = Math.max(longest, run);
    });
    expect(longest).toBeLessThan(4);
  });

  it('glitches, tearing the word on some ticks', () => {
    const torn = TICKS.filter((t) => !wordMatches(frameAt(t)));
    expect(torn.length).toBeGreaterThan(TICKS.length * 0.2);
  });

  it('lights both phosphors', () => {
    const frame = frameAt(5);
    expect(frame.some((value) => value > 0)).toBe(true);
    expect(frame.some((value) => value < 0)).toBe(true);
  });

  it('holds still between glitch ticks, so a slow clock reads as stutter rather than shimmer', () => {
    expect(frameAt(8.01)).toEqual(frameAt(8.2));
  });

  it('stays in the level range for every input, without throwing', () => {
    const out = createFrame();
    [NaN, Infinity, -Infinity, 1e308, -1e308, -5, 5e-324].forEach((t) => {
      expect(() => segfaultProgram.render(t, out)).not.toThrow();
      expect(out.every((value) => value >= -4 && value <= 4)).toBe(true);
    });
  });

  it('labels itself', () => {
    expect(segfaultProgram.source).toBe('SEGFAULT');
  });
});
