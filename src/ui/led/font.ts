/** Each glyph is a list of rows, most significant bit on the left. */
const MINI: Record<string, readonly number[]> = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 7], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2],
  8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ':': [0, 2, 0, 2, 0], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0], '/': [1, 1, 2, 4, 4],
  '!': [2, 2, 2, 0, 2], '?': [6, 1, 2, 0, 2], ' ': [0, 0, 0, 0, 0],
};

const BANNER: Record<string, readonly number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14],
  2: [14, 17, 1, 6, 8, 16, 31], 3: [31, 2, 4, 2, 1, 17, 14],
  4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8],
  8: [14, 17, 17, 14, 17, 17, 14], 9: [14, 17, 17, 15, 1, 2, 12],
  ':': [0, 4, 4, 0, 4, 4, 0], ' ': [0, 0, 0, 0, 0, 0, 0],
};

const plaqueGlyph = (rows: readonly string[]): readonly number[] =>
  rows.map((row) => parseInt(row.replace(/#/g, '1').replace(/\./g, '0'), 2));

/** Nine rows tall on two-cell stems, in the hand of the lockup. Only what the plaque spells. */
const PLAQUE: Record<string, readonly number[]> = {
  H: plaqueGlyph(['##..##', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##', '##..##']),
  A: plaqueGlyph(['.####.', '######', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##']),
  L: plaqueGlyph(['##....', '##....', '##....', '##....', '##....', '##....', '##....', '######', '######']),
  T: plaqueGlyph(['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..']),
  E: plaqueGlyph(['######', '######', '##....', '#####.', '#####.', '##....', '##....', '######', '######']),
  D: plaqueGlyph(['#####.', '######', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '#####.']),
};

export interface LedFont {
  readonly width: number;
  readonly height: number;
  readonly glyphs: Record<string, readonly number[]>;
}

export const FONT_MINI: LedFont = { width: 3, height: 5, glyphs: MINI };
export const FONT_PLAQUE: LedFont = { width: 6, height: 9, glyphs: PLAQUE };

/** Smeared one cell right: a two-cell stem is what survives being punched out of a tile block. */
const bold = (rows: readonly number[]): readonly number[] => rows.map((row) => (row << 1) | row);

export const FONT_BANNER: LedFont = {
  width: 6,
  height: 7,
  glyphs: Object.fromEntries(Object.entries(BANNER).map(([char, rows]) => [char, bold(rows)])),
};

export function textWidth(font: LedFont, text: string): number {
  return text.length === 0 ? 0 : text.length * (font.width + 1) - 1;
}

/** Calls plot for every lit cell of the text, in wall coordinates. */
export function eachTextCell(
  font: LedFont,
  text: string,
  left: number,
  top: number,
  plot: (x: number, y: number) => void,
): void {
  [...text.toUpperCase()].forEach((char, index) => {
    const rows = font.glyphs[char] ?? font.glyphs[' '];
    if (!rows) return;
    const originX = left + index * (font.width + 1);
    rows.forEach((row, rowIndex) => {
      for (let bit = 0; bit < font.width; bit++) {
        if (row & (1 << (font.width - 1 - bit))) plot(originX + bit, top + rowIndex);
      }
    });
  });
}

/** Our lettering for the lockup. Two-cell strokes, drawn for this project. */
export const WORDMARK_TURING = ['T', 'U', 'R', 'I', 'N', 'G'] as const;
export const WORDMARK_WHEEL = ['W', 'H', 'E', 'E', 'L'] as const;

export const WORDMARK_GLYPHS: Record<string, readonly string[]> = {
  T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
  U: ['##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '######', '.####.'],
  R: ['#####.', '######', '##..##', '##..##', '#####.', '####..', '##.##.', '##..##', '##..##'],
  I: ['##', '##', '##', '##', '##', '##', '##', '##', '##'],
  N: ['##...##', '###..##', '###..##', '####.##', '##.####', '##..###', '##..###', '##...##', '##...##'],
  G: ['.#####', '######', '##....', '##....', '##.###', '##.###', '##..##', '######', '.#####'],
  W: ['##.....##', '##.....##', '##..#..##', '##..#..##', '##.###.##', '##.###.##', '#########', '####.####', '###...###'],
  H: ['##...##', '##...##', '##...##', '#######', '#######', '##...##', '##...##', '##...##', '##...##'],
  E: ['######', '######', '##....', '#####.', '#####.', '##....', '##....', '######', '######'],
  L: ['##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '##.....', '#######', '#######'],
};
