import { CELLS, COLS } from '../types';
import { datan2 } from './dmath';
import type { VarName } from './parser';

function table(value: (x: number, y: number) => number): Float64Array {
  const cells = new Float64Array(CELLS);
  for (let k = 0; k < CELLS; k += 1) cells[k] = value(k % COLS, Math.floor(k / COLS));
  return cells;
}

const centredX = (x: number): number => x - 31.5;
const centredY = (y: number): number => y - 17.5;

/** Per-cell values, shared by every program and never written after load. */
export const GRID: Readonly<Record<Exclude<VarName, 't'>, Float64Array>> = {
  x: table((x) => x),
  y: table((_, y) => y),
  i: table((x, y) => y * COLS + x),
  u: table(centredX),
  v: table((_, y) => centredY(y)),
  r: table((x, y) => Math.sqrt(centredX(x) * centredX(x) + centredY(y) * centredY(y))),
  a: table((x, y) => datan2(centredY(y), centredX(x))),
};
