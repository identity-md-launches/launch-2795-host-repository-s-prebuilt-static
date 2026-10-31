import { describe, expect, it } from 'vitest';
import { CELLS, COLS, MAX_SOURCE_BYTES, ROWS, createFrame, type Frame, type Program } from '../types';
import {
  datan2,
  dceil,
  dclamp,
  dcos,
  dfract,
  dhash,
  dhypot,
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
import { compile } from './index';
import { MAX_NESTING, parse, type Expr } from './parser';

const build = (source: string): Program => {
  const result = compile(source);
  if (!result.ok) throw new Error(`${source}: ${result.error.message} at ${result.error.index}`);
  return result.program;
};

const frameOf = (source: string, t = 0): Frame => {
  const out = createFrame();
  build(source).render(t, out);
  return out;
};

const cell = (frame: Frame, x: number, y: number): number => frame[y * COLS + x]!;

/** Level of the top-left cell, for checking a value expression. */
const level = (source: string, t = 0): number => frameOf(source, t)[0]!;

const holds = (source: string): void => {
  expect(level(`(${source})==1`), source).toBe(4);
};

const failure = (source: string) => {
  const result = compile(source);
  if (result.ok) throw new Error(`expected "${source}" to fail`);
  return result.error;
};

describe('source limits', () => {
  it(`accepts exactly ${MAX_SOURCE_BYTES} bytes`, () => {
    const source = 'x' + ' '.repeat(MAX_SOURCE_BYTES - 1);
    expect(source.length).toBe(MAX_SOURCE_BYTES);
    expect(compile(source).ok).toBe(true);
  });

  it('rejects one byte too many, pointing at the excess', () => {
    const source = 'x' + ' '.repeat(MAX_SOURCE_BYTES + 4);
    expect(failure(source)).toMatchObject({ index: MAX_SOURCE_BYTES, length: 5 });
    expect(failure(source).message).toMatch(/140/);
  });

  it('rejects non-ASCII at the first offending character', () => {
    expect(failure('x+é+1')).toMatchObject({ index: 2, length: 1 });
    expect(failure('x+é+1').message).toMatch(/ASCII/);
  });

  it('measures a surrogate pair as one offending character', () => {
    expect(failure('x+\u{1F439}')).toMatchObject({ index: 2, length: 2 });
  });

  it('rejects what the contract rejects: control characters', () => {
    expect(failure('x\t+1')).toMatchObject({ index: 1, length: 1 });
    expect(failure('x\n')).toMatchObject({ index: 1, length: 1 });
    expect(failure('x\u007f')).toMatchObject({ index: 1, length: 1 });
  });

  it('reports ASCII before length, since the editor counts bytes', () => {
    expect(failure('é'.repeat(200))).toMatchObject({ index: 0, length: 1 });
  });

  it('rejects an empty program', () => {
    expect(failure('')).toMatchObject({ index: 0, length: 0 });
  });

  it('turns parser errors into results, never exceptions', () => {
    expect(failure('sin(')).toMatchObject({ index: 4, length: 0 });
    expect(failure('nope')).toMatchObject({ index: 0, length: 4 });
    expect(failure('('.repeat(MAX_NESTING + 1) + 'x').message).toMatch(/nest/i);
  });

  it('keeps the source on the program', () => {
    expect(build('x+1').source).toBe('x+1');
  });
});

describe('output mapping', () => {
  const table: readonly (readonly [string, number])[] = [
    ['0', 0],
    ['.124', 0],
    ['.125', 1],
    ['.25', 1],
    ['.374', 1],
    ['.375', 2],
    ['.5', 2],
    ['.625', 3],
    ['.875', 4],
    ['1', 4],
    ['99', 4],
    ['-.124', 0],
    ['-.125', -1],
    ['-.5', -2],
    ['-1', -4],
    ['-99', -4],
    ['0/0', 0],
    ['1/0', 0],
    ['-1/0', 0],
    ['sqrt(-1)', 0],
  ];

  table.forEach(([source, expected]) => {
    it(`maps ${source} to level ${expected}, for uniform and per-cell programs`, () => {
      expect(frameOf(source).every((value) => value === expected)).toBe(true);
      expect(cell(frameOf(`x==0?${source}:0`), 0, 0)).toBe(expected);
    });
  });
});

describe('variables', () => {
  const expectEverywhere = (source: string): void => {
    expect(frameOf(source).every((value) => value === 4)).toBe(true);
  };

  it('x and y walk the grid', () => {
    expect(cell(frameOf('x==5&&y==7'), 5, 7)).toBe(4);
    expect(frameOf('x==5&&y==7').reduce((sum, value) => sum + value, 0)).toBe(4);
  });

  it('i is y*64+x', () => expectEverywhere('i==y*64+x'));
  it('u and v are centred', () => expectEverywhere('u==x-31.5&&v==y-17.5'));
  it('r is the distance from centre', () => expectEverywhere('abs(r-sqrt(u*u+v*v))<1e-12'));
  it('a is the angle from centre', () => expectEverywhere('abs(a-atan2(v,u))<1e-12'));

  it('t arrives as given, including fractions', () => {
    expect(level('t==2.5', 2.5)).toBe(4);
    expect(level('t==2.5', 2)).toBe(0);
  });

  it('t mixes with cell variables', () => {
    expect(frameOf('x<t', 10).reduce((sum, value) => sum + value, 0)).toBe(10 * 36 * 4);
  });
});

describe('operators', () => {
  [
    '7+2==9',
    '7-2==5',
    '7*2==14',
    '7/2==3.5',
    '-7%3==-1',
    '7.5%2==1.5',
    '1e308%3==0',
    '2**10==1024',
    '2**3**2==512',
    '(1<2)==1',
    '(2<1)==0',
    '(2<=2)==1',
    '(3>2)==1',
    '(3>=4)==0',
    '(3==3)==1',
    '(3!=3)==0',
    '(0&&5)==0',
    '(3&&5)==5',
    '(0||5)==5',
    '(3||5)==3',
    '(0/0||5)==5',
    '!0==1',
    '!7==0',
    '!(0/0)==1',
    '(1?2:3)==2',
    '(0?2:3)==3',
    '(0/0?2:3)==3',
    '(6&3)==2',
    '(6|3)==7',
    '(6^3)==5',
    '~0==-1',
    '~5==-6',
    '(1<<4)==16',
    '(-16>>2)==-4',
    '(1<<33)==2',
    '(5.9&7)==5',
    '(-1&255)==255',
    '(4294967297|0)==1',
    '(1/0|0)==0',
    '(0/0&1)==0',
    '-(-3)==3',
    '+3==3',
  ].forEach((source) => {
    it(source, () => holds(source));
  });
});

describe('functions', () => {
  [
    'abs(-3)==3',
    'floor(2.7)==2',
    'floor(-2.1)==-3',
    'ceil(2.1)==3',
    'round(2.5)==3',
    'sqrt(16)==4',
    'sign(-4)==-1',
    'min(3,1,2)==1',
    'max(3,1,2)==3',
    'mod(-1,4)==3',
    'hypot(3,4)==5',
    'clamp(5,0,2)==2',
    'mix(0,10,.5)==5',
    'step(1,2)==1',
    'step(3,2)==0',
    'fract(2.25)==.25',
    'sin(0)==0',
    'cos(0)==1',
    'abs(sin(1.5707963267948966)-1)<1e-15',
    'abs(tan(.7853981633974483)-1)<1e-15',
    'abs(atan2(1,1)-.7853981633974483)<1e-15',
    'hash(1,2,3)<1',
    'hash(1,2,3)>0',
    'abs(noise(.5,.5,.5))<=1',
  ].forEach((source) => {
    it(source, () => holds(source));
  });
});

const VARIABLE = (name: string, x: number, y: number, t: number): number => {
  const u = x - 31.5;
  const v = y - 17.5;
  switch (name) {
    case 't':
      return t;
    case 'x':
      return x;
    case 'y':
      return y;
    case 'i':
      return y * COLS + x;
    case 'u':
      return u;
    case 'v':
      return v;
    case 'r':
      return Math.sqrt(u * u + v * v);
    default:
      return datan2(v, u);
  }
};

const interpret = (e: Expr, x: number, y: number, t: number): number => {
  if (e.kind === 'num') return e.value;
  if (e.kind === 'var') return VARIABLE(e.name, x, y, t);
  const [first, second, third] = e.args;
  const a = (): number => interpret(first!, x, y, t);
  const b = (): number => interpret(second!, x, y, t);
  const c = (): number => interpret(third!, x, y, t);
  switch (e.op) {
    case 'neg': return -a();
    case 'not': return a() ? 0 : 1;
    case 'inv': return ~a();
    case 'add': return a() + b();
    case 'sub': return a() - b();
    case 'mul': return a() * b();
    case 'div': return a() / b();
    case 'rem': return drem(a(), b());
    case 'pow': return dpow(a(), b());
    case 'lt': return a() < b() ? 1 : 0;
    case 'le': return a() <= b() ? 1 : 0;
    case 'gt': return a() > b() ? 1 : 0;
    case 'ge': return a() >= b() ? 1 : 0;
    case 'eq': return a() === b() ? 1 : 0;
    case 'ne': return a() !== b() ? 1 : 0;
    case 'and': return a() ? b() : a();
    case 'or': return a() ? a() : b();
    case 'band': return a() & b();
    case 'bor': return a() | b();
    case 'bxor': return a() ^ b();
    case 'shl': return a() << b();
    case 'shr': return a() >> b();
    case 'select': return a() ? b() : c();
    case 'sin': return dsin(a());
    case 'cos': return dcos(a());
    case 'tan': return dtan(a());
    case 'abs': return Math.abs(a());
    case 'floor': return Math.floor(a());
    case 'ceil': return dceil(a());
    case 'round': return dround(a());
    case 'sqrt': return Math.sqrt(a());
    case 'sign': return dsign(a());
    case 'fract': return dfract(a());
    case 'min': return dmin(a(), b());
    case 'max': return dmax(a(), b());
    case 'mod': return dmod(a(), b());
    case 'atan2': return datan2(a(), b());
    case 'hypot': return dhypot(a(), b());
    case 'step': return dstep(a(), b());
    case 'clamp': return dclamp(a(), b(), c());
    case 'mix': return dmix(a(), b(), c());
    case 'hash': return dhash(a(), b(), c());
    case 'noise': return dnoise(a(), b(), c());
  }
};

const toLevel = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.floor(Math.min(Math.abs(value), 1) * 4 + 0.5);
  return value < 0 ? -magnitude : magnitude;
};

const referenceFrame = (source: string, t: number): Frame => {
  const tree = parse(source);
  const out = createFrame();
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      out[y * COLS + x] = toLevel(interpret(tree, x, y, t));
    }
  }
  return out;
};

const seeded = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const ATOMS = ['t', 'x', 'y', 'i', 'u', 'v', 'r', 'a', '0', '1', '2', '.5', '3.7', '1e2', '64', '31'];
const PREFIXES = ['-', '!', '~'];
const INFIXES = ['+', '-', '*', '/', '%', '**', '<', '<=', '>', '>=', '==', '!=', '&&', '||', '&', '|', '^', '<<', '>>'];
const CALLS1 = ['sin', 'cos', 'tan', 'abs', 'floor', 'ceil', 'round', 'sqrt', 'sign', 'fract', 'hash', 'noise'];
const CALLS2 = ['min', 'max', 'mod', 'atan2', 'hypot', 'step', 'hash', 'noise'];
const CALLS3 = ['clamp', 'mix', 'hash', 'noise', 'min', 'max'];

const randomSource = (random: () => number, depth: number): string => {
  const pick = (list: readonly string[]): string => list[Math.floor(random() * list.length)]!;
  const next = (): string => randomSource(random, depth - 1);
  if (depth === 0 || random() < 0.2) return pick(ATOMS);
  const shape = random();
  if (shape < 0.45) return `${next()}${pick(INFIXES)}${next()}`;
  if (shape < 0.55) return `${pick(PREFIXES)}(${next()})`;
  if (shape < 0.7) return `${pick(CALLS1)}(${next()})`;
  if (shape < 0.82) return `${pick(CALLS2)}(${next()},${next()})`;
  if (shape < 0.9) return `${pick(CALLS3)}(${next()},${next()},${next()})`;
  if (shape < 0.95) return `(${next()})?${next()}:${next()}`;
  return `(${next()})`;
};

describe('compiled closures agree with a naive interpreter', () => {
  const times = [0, 0.5, 7.25, 512, 1000000.5, -3.75];

  it('on hand-picked programs', () => {
    const sources = [
      'sin(x/4+t)',
      'x',
      't',
      '1',
      'sin(t)',
      'sin(t)*x',
      'x*sin(t)',
      'sin(t)+sin(t)',
      'x+y',
      'x>t?y:r',
      't>1?x:y',
      't>1?2:y',
      't>1?x:3',
      'x>1?t:y',
      'x>1?y:t',
      'x>1?1:2',
      '(x&y)%3?noise(x/9,y/9,t/4):-r/20',
      'hash(x,y,floor(t))-.5',
      'x&&y',
      'x||t',
      't&&x',
      'clamp(x,t,y)',
      'mix(t,x,.5)',
      'min(t,x,y)',
      'noise(t)',
      'noise(t,x)',
      'hash(t,y)',
    ];
    sources.forEach((source) => {
      times.forEach((t) => {
        expect(frameOf(source, t), `${source} at t=${t}`).toEqual(referenceFrame(source, t));
      });
    });
  });

  it('on a thousand random programs', () => {
    const random = seeded(20261031);
    let compared = 0;
    while (compared < 1000) {
      const source = randomSource(random, 4);
      if (source.length <= MAX_SOURCE_BYTES) {
        compared += 1;
        const t = times[compared % times.length]!;
        expect(frameOf(source, t), `${source} at t=${t}`).toEqual(referenceFrame(source, t));
      }
    }
  }, 60000);
});

describe('programs are independent and repeatable', () => {
  it('does not depend on what rendered before', () => {
    const a = build('sin(x/3+t)*cos(y/3-t)');
    const b = build('noise(x/9,y/9,t)+r/40');
    const first = createFrame();
    a.render(3, first);
    const noise = createFrame();
    b.render(9, noise);
    a.render(100, noise);
    const second = createFrame();
    a.render(3, second);
    expect(second).toEqual(first);
  });

  it('overwrites the whole frame', () => {
    const out = createFrame().fill(4);
    build('0').render(0, out);
    expect(out.every((value) => value === 0)).toBe(true);
  });

  it('renders deep right-nested programs that need many registers', () => {
    const open = 'x+('.repeat(14);
    const source = `${open}y${')'.repeat(14)}`;
    expect(frameOf(source, 0)).toEqual(referenceFrame(source, 0));
  });
});

describe('render never throws', () => {
  const inputs = [NaN, Infinity, -Infinity, 1e308, -1e308, 5e-324, -0, 2 ** 53, 1e15];
  const sources = [
    'sin(t)',
    'sin(x*t)',
    'cos(t*t)',
    'tan(t+x)',
    'atan2(t,x)',
    'hash(t,x)',
    'noise(t,x,y)',
    'x**t',
    't**x',
    '(-1)**t',
    'floor(t)%x',
    't<<x',
    't>>x',
    '~t',
    'x/0',
    '0/0',
    'sqrt(-t)',
    'mod(t,0)',
    'clamp(t,x,y)',
  ];

  sources.forEach((source) => {
    it(source, () => {
      const out = createFrame();
      const program = build(source);
      inputs.forEach((t) => {
        expect(() => program.render(t, out)).not.toThrow();
        expect(out.every((value) => value >= -4 && value <= 4)).toBe(true);
      });
    });
  });

  it('tolerates a mis-sized frame', () => {
    expect(() => build('x').render(0, new Int8Array(3))).not.toThrow();
    expect(() => build('t').render(0, new Int8Array(CELLS + 5))).not.toThrow();
  });
});

describe('compile never throws', () => {
  it('on random garbage', () => {
    const random = seeded(7);
    const alphabet = 'txyiuvra0123456789.eE+-*/%<>=!&|^~?:(), sincoshabfloormx';
    for (let round = 0; round < 20000; round += 1) {
      const length = Math.floor(random() * 40);
      const source = Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const result = compile(source);
      if (!result.ok) {
        expect(result.error.index).toBeGreaterThanOrEqual(0);
        expect(result.error.index + result.error.length).toBeLessThanOrEqual(source.length);
      }
    }
  });
});
