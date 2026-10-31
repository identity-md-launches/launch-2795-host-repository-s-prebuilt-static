import { NOISE_DEFAULT_Y, NOISE_DEFAULT_Z } from './dmath';
import { LangError, nextToken, type Token } from './tokens';

export { LangError };

export const MAX_NESTING = 32;

export type VarName = 't' | 'x' | 'y' | 'i' | 'u' | 'v' | 'r' | 'a';

export type OpName =
  | 'neg' | 'not' | 'inv'
  | 'add' | 'sub' | 'mul' | 'div' | 'rem' | 'pow'
  | 'lt' | 'le' | 'gt' | 'ge' | 'eq' | 'ne'
  | 'and' | 'or' | 'band' | 'bor' | 'bxor' | 'shl' | 'shr'
  | 'select'
  | 'sin' | 'cos' | 'tan' | 'abs' | 'floor' | 'ceil' | 'round' | 'sqrt' | 'sign' | 'fract'
  | 'min' | 'max' | 'mod' | 'atan2' | 'hypot' | 'step'
  | 'clamp' | 'mix' | 'hash' | 'noise';

export type Expr =
  | { readonly kind: 'num'; readonly value: number }
  | { readonly kind: 'var'; readonly name: VarName }
  | { readonly kind: 'call'; readonly op: OpName; readonly args: readonly Expr[] };

const VARIABLES: ReadonlySet<string> = new Set<VarName>(['t', 'x', 'y', 'i', 'u', 'v', 'r', 'a']);

interface Signature {
  readonly min: number;
  readonly max: number;
  /** Fills omitted trailing arguments. */
  readonly pad?: readonly number[];
}

const unary: Signature = { min: 1, max: 1 };
const binary: Signature = { min: 2, max: 2 };
const ternary: Signature = { min: 3, max: 3 };
const variadic: Signature = { min: 2, max: Infinity };

const FUNCTIONS: ReadonlyMap<string, Signature> = new Map<OpName, Signature>([
  ['sin', unary], ['cos', unary], ['tan', unary], ['abs', unary], ['floor', unary],
  ['ceil', unary], ['round', unary], ['sqrt', unary], ['sign', unary], ['fract', unary],
  ['mod', binary], ['atan2', binary], ['hypot', binary], ['step', binary],
  ['clamp', ternary], ['mix', ternary],
  ['min', variadic], ['max', variadic],
  ['hash', { min: 1, max: 3, pad: [0, 0] }],
  ['noise', { min: 1, max: 3, pad: [NOISE_DEFAULT_Y, NOISE_DEFAULT_Z] }],
]);

const TERNARY_POWER = 1;
const PREFIX_POWER = 12;

interface Infix {
  readonly op: OpName;
  readonly power: number;
  readonly rightAssociative?: boolean;
}

const INFIX: ReadonlyMap<string, Infix> = new Map<string, Infix>([
  ['||', { op: 'or', power: 2 }],
  ['&&', { op: 'and', power: 3 }],
  ['|', { op: 'bor', power: 4 }],
  ['^', { op: 'bxor', power: 5 }],
  ['&', { op: 'band', power: 6 }],
  ['==', { op: 'eq', power: 7 }],
  ['!=', { op: 'ne', power: 7 }],
  ['<', { op: 'lt', power: 8 }],
  ['<=', { op: 'le', power: 8 }],
  ['>', { op: 'gt', power: 8 }],
  ['>=', { op: 'ge', power: 8 }],
  ['<<', { op: 'shl', power: 9 }],
  ['>>', { op: 'shr', power: 9 }],
  ['+', { op: 'add', power: 10 }],
  ['-', { op: 'sub', power: 10 }],
  ['*', { op: 'mul', power: 11 }],
  ['/', { op: 'div', power: 11 }],
  ['%', { op: 'rem', power: 11 }],
  ['**', { op: 'pow', power: 13, rightAssociative: true }],
]);

const PREFIX: ReadonlyMap<string, OpName | null> = new Map([
  ['-', 'neg'],
  ['!', 'not'],
  ['~', 'inv'],
  ['+', null],
]);

const call = (op: OpName, args: readonly Expr[]): Expr => ({ kind: 'call', op, args });
const number = (value: number): Expr => ({ kind: 'num', value });

function plural(count: number): string {
  return count === 1 ? '1 argument' : `${count} arguments`;
}

function arityMessage(name: string, signature: Signature): string {
  if (signature.min === signature.max) return `${name} takes ${plural(signature.min)}`;
  if (signature.max === Infinity) return `${name} takes at least ${plural(signature.min)}`;
  return `${name} takes ${signature.min} to ${signature.max} arguments`;
}

function buildCall(name: Token, signature: Signature, args: readonly Expr[]): Expr {
  if (args.length < signature.min || args.length > signature.max) {
    throw new LangError(arityMessage(name.text, signature), name.index, name.length);
  }
  const op = name.text as OpName;
  if (signature.max === Infinity) {
    return args.slice(1).reduce((left, right) => call(op, [left, right]), args[0]!);
  }
  const missing = (signature.pad ?? []).slice(args.length - signature.min);
  return call(op, [...args, ...missing.map(number)]);
}

export function parse(source: string): Expr {
  let position = 0;
  let held: Token | null = null;
  let nesting = 0;

  // Scans lazily so the leftmost problem in the source is the one reported.
  const peek = (): Token => {
    held ??= nextToken(source, position);
    return held;
  };
  const advance = (): Token => {
    const token = peek();
    position = token.index + token.length;
    held = null;
    return token;
  };
  const at = (text: string): boolean => peek().kind === 'op' && peek().text === text;
  const unexpected = (token: Token): LangError =>
    token.kind === 'end'
      ? new LangError('Unexpected end of program', token.index, 0)
      : new LangError(`Unexpected ${token.text}`, token.index, token.length);

  const expect = (text: string): void => {
    if (!at(text)) {
      const token = peek();
      throw new LangError(`Expected ${text}`, token.index, token.length);
    }
    advance();
  };

  const nested = (opener: Token, power: number): Expr => {
    nesting += 1;
    if (nesting > MAX_NESTING) throw new LangError('Nested too deeply', opener.index, opener.length);
    const inner = expression(power);
    nesting -= 1;
    return inner;
  };

  const argumentsOf = (open: Token): readonly Expr[] => {
    const args: Expr[] = [];
    if (at(')')) {
      advance();
      return args;
    }
    args.push(nested(open, 0));
    while (at(',')) {
      advance();
      args.push(nested(open, 0));
    }
    expect(')');
    return args;
  };

  const name = (token: Token): Expr => {
    const signature = FUNCTIONS.get(token.text);
    if (signature === undefined && !VARIABLES.has(token.text)) {
      const noun = source[token.index + token.length] === '(' ? 'function' : 'name';
      throw new LangError(`Unknown ${noun} ${token.text}`, token.index, token.length);
    }
    if (signature === undefined) {
      if (at('(')) throw new LangError(`${token.text} is a variable, not a function`, token.index, token.length);
      return { kind: 'var', name: token.text as VarName };
    }
    if (!at('(')) throw new LangError(`${token.text} needs parentheses, like ${token.text}(x)`, token.index, token.length);
    return buildCall(token, signature, argumentsOf(advance()));
  };

  const prefix = (): Expr => {
    const token = advance();
    if (token.kind === 'number') return number(token.value);
    if (token.kind === 'name') return name(token);
    if (token.kind === 'end') throw unexpected(token);
    if (token.text === '(') {
      const inner = nested(token, 0);
      expect(')');
      return inner;
    }
    const op = PREFIX.get(token.text);
    if (op === undefined) throw unexpected(token);
    const operand = nested(token, PREFIX_POWER);
    return op === null ? operand : call(op, [operand]);
  };

  const expression = (minimum: number): Expr => {
    let left = prefix();
    for (;;) {
      if (at('?') && TERNARY_POWER >= minimum) {
        const question = advance();
        const whenTrue = nested(question, 0);
        const colon = peek();
        expect(':');
        left = call('select', [left, whenTrue, nested(colon, TERNARY_POWER)]);
      } else {
        const infix = peek().kind === 'op' ? INFIX.get(peek().text) : undefined;
        if (infix === undefined || infix.power < minimum) return left;
        advance();
        left = call(infix.op, [left, expression(infix.rightAssociative ? infix.power : infix.power + 1)]);
      }
    }
  };

  const tree = expression(0);
  if (peek().kind !== 'end') throw unexpected(peek());
  return tree;
}
