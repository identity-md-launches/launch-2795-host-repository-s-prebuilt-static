import { createFrame } from '../types';
import {
  datan, datan2, dcos, dexp, dhash, dhypot, dlog, dmod, dnoise, dpow, drem, dsin, dtan,
} from './dmath';
import { compile, segfaultProgram } from './index';

export const GOLDEN_TIMES = [0, 1, 2.5, 100.125, 511.75, 4000000.5] as const;

export const GOLDEN_SOURCES = [
  'x/63',
  'sin(x/4+t)',
  'cos(y/3-t)*sin(x/5+t/2)',
  'sin(r-t)',
  'a/3.2+sin(t)',
  'tan(x/9+t)/4',
  'atan2(v,u+t%9)/3',
  '(x^y)%9/9-.5',
  '(x&y|t)%5/5',
  'x<<2>>1&31',
  '~x%3/2',
  'x**(y/18)%1',
  '(u*u+v*v)**.25/4-t%2',
  '(y/9)**-1.5-1',
  'sqrt(r)/4+sign(u)*.25',
  'mod(x-t,7)/7-fract(y/5)',
  'floor(x/4)/9+ceil(y/4)/9+round(t)%2',
  'clamp(u/9,-.5,.5)+step(0,v)/4',
  'mix(u,v,sin(t))/20',
  'hypot(u,v/2)/20-min(x,y,9)/9+max(x,y)/99',
  'hash(x,y)-.5',
  'hash(x,y,floor(t))-.5',
  'hash(x/3,t)-hash(y)',
  'noise(x/9)',
  'noise(x/9,y/9)',
  'noise(x/9,y/9,t/4)',
  'x>32&&y<18?sin(t):x<9||y>30?-.5:!(x%8)',
  'sin(t*1000+x)',
  'sin(t*t+y)',
  'cos(1e9*(x+t))',
  'this source does not compile',
] as const;

const FNV_PRIME = 16777619;
const FNV_OFFSET = 2166136261;

function mulFnv(a: number): number {
  return ((a & 0xffff) * FNV_PRIME + (((a >>> 16) * FNV_PRIME) << 16)) | 0;
}

export function hashFrame(frame: Int8Array): string {
  let h = FNV_OFFSET | 0;
  for (let k = 0; k < frame.length; k += 1) h = mulFnv(h ^ (frame[k]! + 4));
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** One line per program, each frame hash in GOLDEN_TIMES order. */
export function goldenTable(sources: readonly string[]): readonly string[] {
  const out = createFrame();
  return sources.map((source) => {
    const result = compile(source);
    const program = result.ok ? result.program : segfaultProgram;
    return GOLDEN_TIMES.map((t) => {
      program.render(t, out);
      return hashFrame(out);
    }).join(' ');
  });
}

function fingerprintInputs(): readonly number[] {
  const scales = [1, 7, 512, 1e4, 4e6, 1e9, 1e15, 1e300];
  const mask = 0xffffffffffffffffn;
  let state = 88172645463325252n;
  return Array.from({ length: 200000 }, (_, k) => {
    state ^= (state << 13n) & mask;
    state ^= state >> 7n;
    state ^= (state << 17n) & mask;
    const unit = Number(state & 0xfffffffffffffn) / 4503599627370496;
    return (unit - 0.5) * scales[k % scales.length]!;
  });
}

const FINGERPRINTED: ReadonlyMap<string, (x: number, y: number) => number> = new Map([
  ['dsin', (x: number) => dsin(x)],
  ['dcos', (x: number) => dcos(x)],
  ['dtan', (x: number) => dtan(x)],
  ['datan', (x: number) => datan(x)],
  ['datan2', datan2],
  ['dexp', (x: number) => dexp(x % 800)],
  ['dlog', (x: number) => dlog(Math.abs(x))],
  ['dpow', (x: number, y: number) => dpow(Math.abs(x) % 100, y % 20)],
  ['dhypot', dhypot],
  ['dhash', (x: number, y: number) => dhash(x, y, x - y)],
  ['dnoise', (x: number, y: number) => dnoise(x % 1000, y % 1000, (x + y) % 1000)],
  ['dmod', dmod],
  ['drem', drem],
]);

/** Hash of the raw IEEE bits of each function, so last-place drift is visible. NaN payloads are not observable. */
export function dmathFingerprint(): Readonly<Record<string, string>> {
  const inputs = fingerprintInputs();
  const value = new Float64Array(1);
  const bytes = new Uint8Array(value.buffer);
  return Object.fromEntries(
    [...FINGERPRINTED].map(([name, f]) => {
      let h = FNV_OFFSET | 0;
      for (let k = 0; k + 1 < inputs.length; k += 1) {
        const result = f(inputs[k]!, inputs[k + 1]!);
        value[0] = result === result ? result : 0.5;
        for (let b = 0; b < 8; b += 1) h = mulFnv(h ^ bytes[b]!);
      }
      return [name, (h >>> 0).toString(16).padStart(8, '0')];
    }),
  );
}
