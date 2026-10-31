import { CELLS, COLS, ROWS, type Frame, type Program } from '../types';
import { dhash } from './dmath';

const LARGE: Readonly<Record<string, readonly string[]>> = {
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.####', '#....', '#....', '#..##', '#...#', '#...#', '.####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

const SMALL: Readonly<Record<string, readonly string[]>> = {
  C: ['###', '#..', '#..', '#..', '###'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  ' ': ['...', '...', '...', '...', '...'],
};

const WORD_LEFT = 8;
const WORD_TOP = 9;
const CAPTION_LEFT = 11;
const CAPTION_TOP = 26;
const GOLD = 4;
const BLUE = -3;

function stampLarge(sheet: Frame, word: string): void {
  [...word].forEach((letter, index) => {
    (LARGE[letter] ?? []).forEach((row, line) => {
      [...row].forEach((mark, column) => {
        if (mark !== '#') return;
        const left = WORD_LEFT + index * 6 + column;
        sheet[(WORD_TOP + line * 2) * COLS + left] = GOLD;
        sheet[(WORD_TOP + line * 2 + 1) * COLS + left] = GOLD;
      });
    });
  });
}

function stampSmall(sheet: Frame, text: string): void {
  [...text].forEach((letter, index) => {
    (SMALL[letter] ?? []).forEach((row, line) => {
      [...row].forEach((mark, column) => {
        if (mark === '#') sheet[(CAPTION_TOP + line) * COLS + CAPTION_LEFT + index * 4 + column] = BLUE;
      });
    });
  });
}

function buildSheet(): Frame {
  const sheet = new Int8Array(CELLS);
  stampLarge(sheet, 'SEGFAULT');
  stampSmall(sheet, 'CORE DUMPED');
  return sheet;
}

const SHEET = buildSheet();
const TICKS_PER_CYCLE = 4;
const TICKS_PER_SPELL = 5;
const STORM_CHANCE = 0.45;
const MAX_FINITE_TIME = 1e15;
const BAND_ROWS = 3;

/** Deterministic crash screen for a slice whose source does not compile. */
export const segfaultProgram: Program = {
  source: 'SEGFAULT',
  render(t: number, out: Frame): void {
    const tick = Math.abs(t) < MAX_FINITE_TIME ? Math.floor(t * TICKS_PER_CYCLE) : 0;
    const storm = dhash(Math.floor(tick / TICKS_PER_SPELL), 1) < STORM_CHANCE;
    const scanRow = ((tick % ROWS) + ROWS) % ROWS;
    const staticDensity = storm ? 0.16 : 0.035;
    const blockLeft = Math.floor(dhash(tick, 2) * 52);
    const blockTop = Math.floor(dhash(tick, 3) * 30);

    for (let row = 0; row < ROWS; row += 1) {
      const band = Math.floor(row / BAND_ROWS);
      const roll = dhash(band, tick, 4);
      const shift = storm && roll < 0.55 ? Math.floor((dhash(band, tick, 5) - 0.5) * 26) : 0;
      const flipped = storm && roll > 0.8;

      for (let col = 0; col < COLS; col += 1) {
        const source = ((col + shift) % COLS + COLS) % COLS;
        const mark = SHEET[row * COLS + source]!;
        const noise = dhash(col, row, Math.floor(tick / 2));
        const inBlock = storm && col >= blockLeft && col < blockLeft + 12 && row >= blockTop && row < blockTop + 6;

        const level = inBlock
          ? noise < 0.5 ? 3 : -2
          : mark !== 0
            ? flipped ? -mark : mark
            : row === scanRow
              ? -2
              : noise < staticDensity ? -1 : 0;
        out[row * COLS + col] = level;
      }
    }
  },
};
