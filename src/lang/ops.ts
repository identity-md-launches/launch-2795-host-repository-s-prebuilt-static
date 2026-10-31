import {
  datan2, dceil, dclamp, dcos, dfract, dhash, dhypot, dmax, dmin, dmix, dmod, dnoise, dpow,
  drem, dround, dsign, dsin, dstep, dtan,
} from './dmath';
import type { OpName } from './parser';

export type Register = Float64Array;
export type Instruction = () => void;

/** Writes n results to d. d may alias an operand: each loop reads index k before writing it. */
type Builder = (d: Register, n: number, a: Register, b: Register, e: Register) => Instruction;

// One literal per operator keeps each loop monomorphic. A shared loop calling a function
// argument would go megamorphic, and box a double for every cell.
export const OPS: Readonly<Record<OpName, Builder>> = {
  neg: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = -a[k]!; },
  not: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! ? 0 : 1; },
  inv: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = ~a[k]!; },

  add: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! + b[k]!; },
  sub: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! - b[k]!; },
  mul: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! * b[k]!; },
  div: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! / b[k]!; },
  rem: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = drem(a[k]!, b[k]!); },
  pow: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = dpow(a[k]!, b[k]!); },

  lt: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! < b[k]! ? 1 : 0; },
  le: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! <= b[k]! ? 1 : 0; },
  gt: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! > b[k]! ? 1 : 0; },
  ge: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! >= b[k]! ? 1 : 0; },
  eq: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! === b[k]! ? 1 : 0; },
  ne: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! !== b[k]! ? 1 : 0; },

  and: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) { const v = a[k]!; d[k] = v ? b[k]! : v; } },
  or: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) { const v = a[k]!; d[k] = v ? v : b[k]!; } },
  band: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! & b[k]!; },
  bor: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! | b[k]!; },
  bxor: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! ^ b[k]!; },
  shl: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! << b[k]!; },
  shr: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! >> b[k]!; },

  select: (d, n, a, b, e) => () => { for (let k = 0; k < n; k += 1) d[k] = a[k]! ? b[k]! : e[k]!; },

  sin: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dsin(a[k]!); },
  cos: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dcos(a[k]!); },
  tan: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dtan(a[k]!); },
  abs: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = Math.abs(a[k]!); },
  floor: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = Math.floor(a[k]!); },
  ceil: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dceil(a[k]!); },
  round: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dround(a[k]!); },
  sqrt: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = Math.sqrt(a[k]!); },
  sign: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dsign(a[k]!); },
  fract: (d, n, a) => () => { for (let k = 0; k < n; k += 1) d[k] = dfract(a[k]!); },

  min: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = dmin(a[k]!, b[k]!); },
  max: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = dmax(a[k]!, b[k]!); },
  mod: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = dmod(a[k]!, b[k]!); },
  atan2: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = datan2(a[k]!, b[k]!); },
  hypot: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = dhypot(a[k]!, b[k]!); },
  step: (d, n, a, b) => () => { for (let k = 0; k < n; k += 1) d[k] = dstep(a[k]!, b[k]!); },

  clamp: (d, n, a, b, e) => () => { for (let k = 0; k < n; k += 1) d[k] = dclamp(a[k]!, b[k]!, e[k]!); },
  mix: (d, n, a, b, e) => () => { for (let k = 0; k < n; k += 1) d[k] = dmix(a[k]!, b[k]!, e[k]!); },
  hash: (d, n, a, b, e) => () => { for (let k = 0; k < n; k += 1) d[k] = dhash(a[k]!, b[k]!, e[k]!); },
  noise: (d, n, a, b, e) => () => { for (let k = 0; k < n; k += 1) d[k] = dnoise(a[k]!, b[k]!, e[k]!); },
};
