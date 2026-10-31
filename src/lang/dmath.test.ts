import { describe, expect, it } from 'vitest';
import {
  datan,
  datan2,
  dceil,
  dclamp,
  dcos,
  dexp,
  dfract,
  dhash,
  dhypot,
  dlog,
  dmax,
  dmin,
  dmix,
  dmod,
  dnoise,
  dpow,
  drem,
  dround,
  dsign,
  dsin,
  dstep,
  dtan,
} from './dmath';

const sweep = (from: number, to: number, count: number): number[] =>
  Array.from({ length: count }, (_, k) => from + ((to - from) * k) / (count - 1));

const worstError = (xs: readonly number[], f: (x: number) => number, oracle: (x: number) => number): number =>
  xs.reduce((worst, x) => Math.max(worst, Math.abs(f(x) - oracle(x))), 0);

describe('dsin and dcos', () => {
  it('match the host library on the first few periods', () => {
    const xs = sweep(-20, 20, 20001);
    expect(worstError(xs, dsin, Math.sin)).toBeLessThan(5e-16);
    expect(worstError(xs, dcos, Math.cos)).toBeLessThan(5e-16);
  });

  it('stay accurate at the scale t reaches, millions of cycles', () => {
    const xs = sweep(1e6, 2e8, 20001).map((x) => x + 0.123456789);
    expect(worstError(xs, dsin, Math.sin)).toBeLessThan(1e-14);
    expect(worstError(xs, dcos, Math.cos)).toBeLessThan(1e-14);
  });

  it('degrade gently out to 1e12', () => {
    const xs = sweep(1e9, 1e12, 5001).map((x) => x + 0.5);
    expect(worstError(xs, dsin, Math.sin)).toBeLessThan(1e-3);
    expect(worstError(xs, dcos, Math.cos)).toBeLessThan(1e-3);
  });

  it('stay inside the unit range for absurd inputs', () => {
    const xs = [1e15, 4.5e15, 1e16, 1e20, 1e100, 1e300, 1.7e308, -1e300];
    xs.forEach((x) => {
      expect(Math.abs(dsin(x))).toBeLessThanOrEqual(1);
      expect(Math.abs(dcos(x))).toBeLessThanOrEqual(1);
    });
  });

  it('keep the Pythagorean identity for absurd inputs too', () => {
    [1e16, 3e20, 1e100, 1e300, -1e300, 1.7e308].forEach((x) => {
      expect(Math.abs(dsin(x) ** 2 + dcos(x) ** 2 - 1)).toBeLessThan(1e-14);
    });
  });

  it('satisfy the Pythagorean identity', () => {
    sweep(-1e7, 1e7, 5003).forEach((x) => {
      const s = dsin(x);
      const c = dcos(x);
      expect(Math.abs(s * s + c * c - 1)).toBeLessThan(1e-15);
    });
  });

  it('give NaN for non-finite input instead of hanging', () => {
    expect(dsin(NaN)).toBeNaN();
    expect(dsin(Infinity)).toBeNaN();
    expect(dcos(-Infinity)).toBeNaN();
  });

  it('hit exact values at zero', () => {
    expect(dsin(0)).toBe(0);
    expect(dcos(0)).toBe(1);
  });
});

describe('dtan', () => {
  it('matches the host library away from its poles', () => {
    const xs = sweep(-1.5, 1.5, 3001);
    expect(worstError(xs, dtan, Math.tan)).toBeLessThan(1e-13);
  });
});

describe('datan and datan2', () => {
  it('datan matches the host library across its range', () => {
    const xs = [...sweep(-3, 3, 6001), ...sweep(-1e6, 1e6, 2001)];
    expect(worstError(xs, datan, Math.atan)).toBeLessThan(5e-16);
  });

  it('datan2 matches the host library in all four quadrants', () => {
    sweep(-40, 40, 161).forEach((y) => {
      sweep(-40, 40, 161).forEach((x) => {
        expect(Math.abs(datan2(y, x) - Math.atan2(y, x))).toBeLessThan(1e-15);
      });
    });
  });

  it('datan2 handles the axes and the origin', () => {
    expect(datan2(0, 0)).toBe(0);
    expect(datan2(1, 0)).toBeCloseTo(Math.PI / 2, 15);
    expect(datan2(-1, 0)).toBeCloseTo(-Math.PI / 2, 15);
    expect(datan2(0, -1)).toBeCloseTo(Math.PI, 15);
    expect(datan2(0, 1)).toBe(0);
  });

  it('propagate NaN', () => {
    expect(datan(NaN)).toBeNaN();
    expect(datan2(NaN, 1)).toBeNaN();
    expect(datan2(1, NaN)).toBeNaN();
  });
});

describe('dexp and dlog', () => {
  it('dexp matches the host library', () => {
    const xs = sweep(-700, 700, 14001);
    xs.forEach((x) => {
      const expected = Math.exp(x);
      expect(Math.abs(dexp(x) - expected) / expected).toBeLessThan(5e-15);
    });
  });

  it('dexp hits its limits', () => {
    expect(dexp(0)).toBe(1);
    expect(dexp(1000)).toBe(Infinity);
    expect(dexp(-1000)).toBe(0);
    expect(dexp(Infinity)).toBe(Infinity);
    expect(dexp(-Infinity)).toBe(0);
    expect(dexp(NaN)).toBeNaN();
  });

  it('dlog matches the host library over the whole exponent range', () => {
    const xs = [...sweep(1e-6, 10, 10001), ...sweep(10, 1e300, 1001), 5e-324, 1e-310, 1e-300];
    xs.forEach((x) => {
      const expected = Math.log(x);
      expect(Math.abs(dlog(x) - expected)).toBeLessThan(2e-13 + Math.abs(expected) * 3e-16);
    });
  });

  it('dlog hits its limits', () => {
    expect(dlog(1)).toBe(0);
    expect(dlog(0)).toBe(-Infinity);
    expect(dlog(-1)).toBeNaN();
    expect(dlog(Infinity)).toBe(Infinity);
    expect(dlog(NaN)).toBeNaN();
  });
});

describe('dpow', () => {
  it('is exact for small integer powers', () => {
    expect(dpow(3, 4)).toBe(81);
    expect(dpow(-2, 3)).toBe(-8);
    expect(dpow(2, -2)).toBe(0.25);
    expect(dpow(1.5, 2)).toBe(2.25);
  });

  it('matches the host operator for fractional powers', () => {
    sweep(0.01, 50, 503).forEach((x) => {
      sweep(-6, 6, 97).forEach((y) => {
        const expected = x ** y;
        expect(Math.abs(dpow(x, y) - expected) / expected).toBeLessThan(1e-12);
      });
    });
  });

  it('follows the host operator on special cases', () => {
    const cases: readonly (readonly [number, number])[] = [
      [0, 0],
      [NaN, 0],
      [2, NaN],
      [NaN, 2],
      [0, 2],
      [0, -2],
      [-8, 1 / 3],
      [1, Infinity],
      [2, Infinity],
      [0.5, Infinity],
      [Infinity, 2],
      [Infinity, -2],
      [2, 2000],
      [2, -2000],
      [-2, 1e300],
      [-1, 1e300],
      [-2, 2147483649],
      [-1, 2147483649],
      [-2, Infinity],
    ];
    cases.forEach(([x, y]) => {
      expect(Object.is(dpow(x, y), x ** y)).toBe(true);
    });
  });
});

describe('drem', () => {
  it('matches the host operator at ordinary magnitudes', () => {
    const values = sweep(-1000, 1000, 2001);
    values.forEach((a) => {
      [7, -7, 0.3, 64, 1e-3].forEach((b) => {
        expect(drem(a, b)).toBe(a % b);
      });
    });
  });

  it('stays exact just under the precision limit', () => {
    expect(drem(2 ** 52 + 1, 2)).toBe(1);
    expect(drem(9007199254740991, 3)).toBe(9007199254740991 % 3);
  });

  it('is zero once the quotient has outrun double precision', () => {
    expect(drem(1e308, 3)).toBe(0);
    expect(drem(2 ** 53, 1)).toBe(0);
    expect(drem(1e308, 1e-308)).toBe(0);
    expect(drem(-1e300, 7)).toBe(0);
  });

  it('keeps the NaN and infinity rules of the host operator', () => {
    expect(drem(1, 0)).toBeNaN();
    expect(drem(0, 0)).toBeNaN();
    expect(drem(Infinity, 3)).toBeNaN();
    expect(drem(NaN, 3)).toBeNaN();
    expect(drem(3, NaN)).toBeNaN();
    expect(drem(5, Infinity)).toBe(5);
  });
});

describe('dhypot', () => {
  it('is the Euclidean norm', () => {
    expect(dhypot(3, 4)).toBe(5);
    expect(dhypot(-3, 4)).toBe(5);
    expect(dhypot(0, 0)).toBe(0);
  });
});

describe('small helpers', () => {
  it('dmod is floored, so it wraps negatives positive', () => {
    expect(dmod(7, 3)).toBe(1);
    expect(dmod(-1, 3)).toBe(2);
    expect(dmod(5.5, 2)).toBe(1.5);
    expect(dmod(1, 0)).toBeNaN();
  });

  it('dfract is the positive fractional part', () => {
    expect(dfract(1.25)).toBe(0.25);
    expect(dfract(-0.25)).toBe(0.75);
    expect(dfract(3)).toBe(0);
  });

  it('dround rounds halves up, for either sign', () => {
    expect(dround(2.5)).toBe(3);
    expect(dround(-2.5)).toBe(-2);
    expect(dround(-2.6)).toBe(-3);
  });

  it('dceil rounds up', () => {
    expect(dceil(1.2)).toBe(2);
    expect(dceil(-1.2)).toBe(-1);
    expect(dceil(3)).toBe(3);
  });

  it('dsign keeps zero and NaN', () => {
    expect(dsign(9)).toBe(1);
    expect(dsign(-9)).toBe(-1);
    expect(dsign(0)).toBe(0);
    expect(dsign(NaN)).toBeNaN();
  });

  it('dmin and dmax propagate NaN from either side', () => {
    expect(dmin(1, 2)).toBe(1);
    expect(dmax(1, 2)).toBe(2);
    expect(dmin(NaN, 1)).toBeNaN();
    expect(dmin(1, NaN)).toBeNaN();
    expect(dmax(NaN, 1)).toBeNaN();
    expect(dmax(1, NaN)).toBeNaN();
  });

  it('dclamp pins to the range', () => {
    expect(dclamp(5, 0, 1)).toBe(1);
    expect(dclamp(-5, 0, 1)).toBe(0);
    expect(dclamp(0.5, 0, 1)).toBe(0.5);
  });

  it('dmix interpolates', () => {
    expect(dmix(2, 4, 0.5)).toBe(3);
    expect(dmix(2, 4, 0)).toBe(2);
    expect(dmix(2, 4, 1)).toBe(4);
  });

  it('dstep is the GLSL step: x below the edge is 0, otherwise 1', () => {
    expect(dstep(1, 0.5)).toBe(0);
    expect(dstep(1, 1)).toBe(1);
    expect(dstep(1, 2)).toBe(1);
  });
});

describe('dhash', () => {
  it('returns values in [0, 1)', () => {
    sweep(-1000, 1000, 4001).forEach((x) => {
      const h = dhash(x, x * 3, x * 7);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    });
  });

  it('is evenly distributed over the display grid', () => {
    const bins = Array.from({ length: 16 }, () => 0);
    for (let y = 0; y < 36; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        for (let t = 0; t < 8; t += 1) {
          const bin = Math.floor(dhash(x, y, t) * 16);
          bins[bin] = (bins[bin] ?? 0) + 1;
        }
      }
    }
    const expected = (64 * 36 * 8) / 16;
    bins.forEach((count) => {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.08);
    });
  });

  it('decorrelates neighbours', () => {
    let sum = 0;
    let count = 0;
    for (let x = 0; x < 2000; x += 1) {
      sum += (dhash(x) - 0.5) * (dhash(x + 1) - 0.5);
      count += 1;
    }
    expect(Math.abs(sum / count)).toBeLessThan(0.01);
  });

  it('separates fractional inputs and every argument position', () => {
    const values = [dhash(1), dhash(1.5), dhash(1.25), dhash(0, 1), dhash(0, 0, 1), dhash(-1), dhash(1e12)];
    expect(new Set(values).size).toBe(values.length);
  });

  it('survives NaN and infinities', () => {
    [dhash(NaN), dhash(Infinity), dhash(-Infinity, NaN, 1e308)].forEach((h) => {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    });
  });

  it('pins known outputs', () => {
    expect(dhash(0)).toBe(HASH_0);
    expect(dhash(1, 2, 3)).toBe(HASH_123);
    expect(dhash(0.5, -7)).toBe(HASH_FRAC);
  });
});

describe('dnoise', () => {
  const field = (t: number): number[] =>
    Array.from({ length: 2304 }, (_, k) => dnoise((k % 64) / 7, Math.floor(k / 64) / 7, t));

  it('stays within [-1, 1]', () => {
    for (let k = 0; k < 40000; k += 1) {
      const n = dnoise(k * 0.0173, k * 0.0311, k * 0.0071);
      expect(Math.abs(n)).toBeLessThanOrEqual(1);
    }
  });

  it('is centred, and busy enough to light both phosphors', () => {
    const values = [0.3, 1.7, 3.1, 4.9, 8.2, 11.4, 15.6, 20.9].flatMap(field);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const deviation = Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(deviation).toBeGreaterThan(0.3);
    expect(deviation).toBeLessThan(0.6);
  });

  it('is continuous in space and time', () => {
    for (let k = 0; k < 5000; k += 1) {
      const x = k * 0.137;
      const y = k * 0.071;
      const z = k * 0.031;
      expect(Math.abs(dnoise(x, y, z) - dnoise(x + 0.001, y, z))).toBeLessThan(0.02);
      expect(Math.abs(dnoise(x, y, z) - dnoise(x, y, z + 0.001))).toBeLessThan(0.02);
    }
  });

  it('is not flat along one axis', () => {
    const values = sweep(0.05, 40, 800).map((x) => dnoise(x));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.8);
  });

  it('survives NaN and infinities', () => {
    expect(() => dnoise(NaN, Infinity, -Infinity)).not.toThrow();
  });

  it('works past the permutation wrap and for negative coordinates', () => {
    expect(Number.isFinite(dnoise(-3.3, 1e6 + 0.5, 300.25))).toBe(true);
  });

  it('pins known outputs', () => {
    expect(dnoise(1.5, 2.25, 3.125)).toBe(NOISE_A);
    expect(dnoise(-7.1, 0.4, 19.9)).toBe(NOISE_B);
  });
});

const HASH_0 = 0.14096470549702644;
const HASH_123 = 0.2274292258080095;
const HASH_FRAC = 0.5689455831889063;
const NOISE_A = 0.7913875579833984;
const NOISE_B = 0.8343539276101628;
