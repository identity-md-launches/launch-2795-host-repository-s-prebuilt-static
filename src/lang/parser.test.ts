import { describe, expect, it } from 'vitest';
import { LangError, MAX_NESTING, parse, type Expr } from './parser';
import { tokenize } from './tokens';

const show = (e: Expr): string => {
  if (e.kind === 'num') return String(e.value);
  if (e.kind === 'var') return e.name;
  return `(${e.op} ${e.args.map(show).join(' ')})`;
};

const failure = (source: string): LangError => {
  try {
    parse(source);
  } catch (error) {
    if (error instanceof LangError) return error;
    throw error;
  }
  throw new Error(`expected "${source}" to fail`);
};

describe('tokenize', () => {
  it('splits a program, skipping spaces, with accurate offsets', () => {
    const tokens = tokenize('sin(t / 2) >= .5');
    expect(tokens.map((tok) => [tok.text, tok.index, tok.length])).toEqual([
      ['sin', 0, 3],
      ['(', 3, 1],
      ['t', 4, 1],
      ['/', 6, 1],
      ['2', 8, 1],
      [')', 9, 1],
      ['>=', 11, 2],
      ['.5', 14, 2],
      ['', 16, 0],
    ]);
  });

  it('reads every number form', () => {
    const value = (text: string): number | undefined => tokenize(text)[0]?.value;
    expect(value('42')).toBe(42);
    expect(value('1.5')).toBe(1.5);
    expect(value('.25')).toBe(0.25);
    expect(value('3.')).toBe(3);
    expect(value('1e3')).toBe(1000);
    expect(value('2.5E-1')).toBe(0.25);
    expect(value('1e+2')).toBe(100);
  });

  it('prefers the longest operator', () => {
    expect(tokenize('a**b<<c>>d&&e||f==g!=h<=i>=j').filter((tok) => tok.kind === 'op').map((tok) => tok.text)).toEqual([
      '**',
      '<<',
      '>>',
      '&&',
      '||',
      '==',
      '!=',
      '<=',
      '>=',
    ]);
  });

  it('points at a stray character', () => {
    expect(() => tokenize('x+$')).toThrow(LangError);
    try {
      tokenize('x+$');
    } catch (error) {
      expect(error).toMatchObject({ index: 2, length: 1 });
    }
  });

  it('explains a lone equals sign', () => {
    try {
      tokenize('x=1');
      throw new Error('should not reach');
    } catch (error) {
      expect(error).toMatchObject({ index: 1, length: 1 });
      expect((error as Error).message).toMatch(/==/);
    }
  });

  it('rejects a dangling exponent over the whole literal', () => {
    try {
      tokenize('1+2e');
      throw new Error('should not reach');
    } catch (error) {
      expect(error).toMatchObject({ index: 2, length: 2 });
    }
  });

  it('rejects a lone dot', () => {
    expect(() => tokenize('.')).toThrow(LangError);
  });

  it('rejects literals with more digits than engines agree on', () => {
    expect(tokenize('12345678901234567890')[0]?.kind).toBe('number');
    try {
      tokenize('x+123456789012345678901');
      throw new Error('should not reach');
    } catch (error) {
      expect(error).toMatchObject({ index: 2, length: 21 });
    }
  });

  it('ignores leading zeros when counting significant digits', () => {
    expect(tokenize('0.000000000000000000000000001')[0]?.kind).toBe('number');
  });
});

describe('parse', () => {
  const table: readonly (readonly [string, string])[] = [
    ['1+2*3', '(add 1 (mul 2 3))'],
    ['(1+2)*3', '(mul (add 1 2) 3)'],
    ['1-2-3', '(sub (sub 1 2) 3)'],
    ['8/4/2', '(div (div 8 4) 2)'],
    ['7%4*2', '(mul (rem 7 4) 2)'],
    ['2**3**2', '(pow 2 (pow 3 2))'],
    ['-x**2', '(neg (pow x 2))'],
    ['2**-1', '(pow 2 (neg 1))'],
    ['-x*2', '(mul (neg x) 2)'],
    ['!x+1', '(add (not x) 1)'],
    ['~x&1', '(band (inv x) 1)'],
    ['+x', 'x'],
    ['--x', '(neg (neg x))'],
    ['1<<2+3', '(shl 1 (add 2 3))'],
    ['1<2<<3', '(lt 1 (shl 2 3))'],
    ['1<2==3<4', '(eq (lt 1 2) (lt 3 4))'],
    ['1&2==3', '(band 1 (eq 2 3))'],
    ['1^2&3', '(bxor 1 (band 2 3))'],
    ['1|2^3', '(bor 1 (bxor 2 3))'],
    ['1&&2|3', '(and 1 (bor 2 3))'],
    ['1||2&&3', '(or 1 (and 2 3))'],
    ['a?1:2', '(select a 1 2)'],
    ['a?1:y?2:3', '(select a 1 (select y 2 3))'],
    ['a?y?1:2:3', '(select a (select y 1 2) 3)'],
    ['a||x?1:2', '(select (or a x) 1 2)'],
    ['x>1?y:r', '(select (gt x 1) y r)'],
    ['1<=x', '(le 1 x)'],
    ['1>=x', '(ge 1 x)'],
    ['1!=x', '(ne 1 x)'],
    ['1>>x', '(shr 1 x)'],
    ['sin(t)', '(sin t)'],
    ['atan2(v,u)', '(atan2 v u)'],
    ['clamp(x,0,1)', '(clamp x 0 1)'],
    ['min(1,2,3)', '(min (min 1 2) 3)'],
    ['max(1,2,3,4)', '(max (max (max 1 2) 3) 4)'],
    ['hash(x)', '(hash x 0 0)'],
    ['hash(x,y)', '(hash x y 0)'],
    ['hash(x,y,t)', '(hash x y t)'],
    ['noise(x)', '(noise x 0.31 0.67)'],
    ['noise(x,y)', '(noise x y 0.67)'],
    ['noise(x,y,t)', '(noise x y t)'],
    ['sin(cos(t))*i', '(mul (sin (cos t)) i)'],
  ];

  table.forEach(([source, tree]) => {
    it(`parses ${source}`, () => {
      expect(show(parse(source))).toBe(tree);
    });
  });

  it('accepts every variable', () => {
    expect(show(parse('t+x+y+i+u+v+r+a'))).toBe('(add (add (add (add (add (add (add t x) y) i) u) v) r) a)');
  });

  it('accepts every function at its arity', () => {
    const calls = [
      'sin(1)',
      'cos(1)',
      'tan(1)',
      'abs(1)',
      'floor(1)',
      'ceil(1)',
      'round(1)',
      'sqrt(1)',
      'sign(1)',
      'fract(1)',
      'min(1,2)',
      'max(1,2)',
      'mod(1,2)',
      'atan2(1,2)',
      'hypot(1,2)',
      'step(1,2)',
      'clamp(1,2,3)',
      'mix(1,2,3)',
    ];
    calls.forEach((source) => expect(() => parse(source)).not.toThrow());
  });
});

describe('parse errors', () => {
  const table: readonly (readonly [string, number, number])[] = [
    ['', 0, 0],
    ['   ', 3, 0],
    ['x+', 2, 0],
    ['(x', 2, 0],
    ['x)', 1, 1],
    ['()', 1, 1],
    ['x y', 2, 1],
    ['2x', 1, 1],
    ['1 2', 2, 1],
    ['x?1', 3, 0],
    ['x?1,2', 3, 1],
    ['foo', 0, 3],
    ['x+bar(1)', 2, 3],
    ['sin', 0, 3],
    ['t+cos', 2, 3],
    ['x(1)', 0, 1],
    ['sin()', 0, 3],
    ['sin(1,2)', 0, 3],
    ['atan2(1)', 0, 5],
    ['clamp(1,2)', 0, 5],
    ['hash()', 0, 4],
    ['hash(1,2,3,4)', 0, 4],
    ['noise(1,2,3,4)', 0, 5],
    ['min(1)', 0, 3],
    ['sin(1', 5, 0],
    ['sin(1,', 6, 0],
    [',', 0, 1],
    ['Math.sin(x)', 0, 4],
    ['foo+$', 0, 3],
    ['x+$+foo', 2, 1],
    ['x*', 2, 0],
    ['!', 1, 0],
  ];

  table.forEach(([source, index, length]) => {
    it(`locates the error in "${source}"`, () => {
      expect(failure(source)).toMatchObject({ index, length });
    });
  });

  ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'eval', 'this', 'window'].forEach((word) => {
    it(`treats ${word} as an unknown name, not a host object`, () => {
      expect(failure(word).message).toMatch(/Unknown name/);
      expect(failure(`${word}(1)`).message).toMatch(/Unknown function/);
    });
  });

  it('names what it did not recognise', () => {
    expect(failure('foo').message).toContain('foo');
    expect(failure('sin(1,2)').message).toMatch(/sin takes 1 argument/);
    expect(failure('atan2(1)').message).toMatch(/atan2 takes 2 arguments/);
  });
});

describe('nesting limit', () => {
  const nested = (open: string, close: string, depth: number): string => open.repeat(depth) + 'x' + close.repeat(depth);

  it('allows parens up to the limit', () => {
    expect(() => parse(nested('(', ')', MAX_NESTING))).not.toThrow();
  });

  it('rejects one paren past the limit, pointing at it', () => {
    expect(failure(nested('(', ')', MAX_NESTING + 1))).toMatchObject({ index: MAX_NESTING, length: 1 });
    expect(failure(nested('(', ')', MAX_NESTING + 1)).message).toMatch(/nest/i);
  });

  it('counts unary chains', () => {
    expect(() => parse('-'.repeat(MAX_NESTING) + 'x')).not.toThrow();
    expect(failure('-'.repeat(MAX_NESTING + 1) + 'x')).toMatchObject({ index: MAX_NESTING, length: 1 });
  });

  it('counts function nesting', () => {
    expect(failure(nested('abs(', ')', MAX_NESTING + 1).slice(0, 200))).toMatchObject({ index: MAX_NESTING * 4 + 3 });
  });

  it('counts ternary chains', () => {
    const chain = 'x?1:'.repeat(MAX_NESTING) + '1';
    expect(() => parse(chain)).not.toThrow();
    expect(() => parse('x?1:' + chain)).toThrow(LangError);
  });

  it('does not count flat left-leaning chains', () => {
    expect(() => parse('x' + '+x'.repeat(69))).not.toThrow();
  });
});
