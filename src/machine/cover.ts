import { CELLS, type Frame } from '../types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXY';

const digit = (level: number | undefined): number => Math.min(4, Math.abs(level ?? 0));

/** Squeekchain Code board cover: two cells per character, row-major, phosphor colour dropped. */
export function frameToCover(frame: Frame): string {
  return Array.from({ length: CELLS / 2 }, (_, k) =>
    ALPHABET.charAt(digit(frame[k * 2]) * 5 + digit(frame[k * 2 + 1])),
  ).join('');
}
