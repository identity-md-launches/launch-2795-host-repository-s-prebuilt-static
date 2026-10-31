import { describe, expect, it } from 'vitest';
import { MAX_SOURCE_BYTES, createFrame } from '../types';
import { compile } from './index';

const fill = (unit: string, joiner = '+'): string => {
  let source = unit;
  while (source.length + joiner.length + unit.length <= MAX_SOURCE_BYTES) source += joiner + unit;
  return source;
};

const HOSTILE: readonly (readonly [string, string])[] = [
  ['remainder of a huge number', fill('1e308%x')],
  ['remainder across the whole exponent range', fill('1e308%(x*1e-308)')],
  ['sine of a huge number', fill('sin(x*1e300)')],
  ['cosine of a huge number', fill('cos(y*1e300)')],
  ['power of a negative base by a huge integer', fill('(-x)**1e300')],
  ['fractional powers', fill('x**a')],
  ['a tower of powers', fill('x', '**a**')],
  ['noise', fill('noise(x,y,t)')],
  ['hash', fill('hash(x,y,t)')],
  ['deep ternaries', fill('sin(x)?r:y')],
];

const FRAME_BUDGET_MS = 16;

describe('a hostile program cannot stall the display', () => {
  HOSTILE.forEach(([name, source]) => {
    it(`${name} stays inside one 60 fps frame`, () => {
      const result = compile(source);
      if (!result.ok) throw new Error(result.error.message);
      const out = createFrame();
      const times = Array.from({ length: 12 }, (_, k) => {
        const start = performance.now();
        result.program.render(k + 3, out);
        return performance.now() - start;
      });
      const median = [...times].sort((a, b) => a - b)[times.length >> 1]!;
      expect(median).toBeLessThan(FRAME_BUDGET_MS);
    });
  });
});
