export class LangError extends Error {
  constructor(
    message: string,
    readonly index: number,
    readonly length: number,
  ) {
    super(message);
  }
}

export interface Token {
  readonly kind: 'number' | 'name' | 'op' | 'end';
  readonly text: string;
  readonly index: number;
  readonly length: number;
  readonly value: number;
}

const OPERATORS = new Set([
  '**', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+', '-', '*', '/', '%', '<', '>', '!', '~', '&', '|', '^', '?', ':', '(', ')', ',',
]);

// ECMAScript only requires exact rounding for literals up to 20 significant digits.
const MAX_SIGNIFICANT_DIGITS = 20;

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= '0' && c <= '9';
const isLetter = (c: string | undefined): boolean =>
  c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_');

function skipDigits(source: string, from: number): number {
  let end = from;
  while (isDigit(source[end])) end += 1;
  return end;
}

function scanNumber(source: string, start: number): Token {
  const whole = skipDigits(source, start);
  const mantissa = source[whole] === '.' ? skipDigits(source, whole + 1) : whole;

  const digits = source.slice(start, mantissa).replace('.', '').replace(/^0+/, '');
  let end = mantissa;
  if (source[end] === 'e' || source[end] === 'E') {
    const signed = source[end + 1] === '+' || source[end + 1] === '-' ? end + 2 : end + 1;
    if (!isDigit(source[signed])) {
      throw new LangError('Exponent needs digits', start, signed - start);
    }
    end = skipDigits(source, signed);
  }

  const length = end - start;
  if (digits.length > MAX_SIGNIFICANT_DIGITS) {
    throw new LangError(`Number has more than ${MAX_SIGNIFICANT_DIGITS} digits`, start, length);
  }
  const text = source.slice(start, end);
  return { kind: 'number', text, index: start, length, value: Number(text) };
}

function scanName(source: string, start: number): Token {
  let end = start;
  while (isLetter(source[end]) || isDigit(source[end])) end += 1;
  return { kind: 'name', text: source.slice(start, end), index: start, length: end - start, value: 0 };
}

function scanOperator(source: string, start: number): Token {
  const pair = source.slice(start, start + 2);
  const text = OPERATORS.has(pair) ? pair : source.charAt(start);
  if (text === '=') throw new LangError('Use == to compare. There is no assignment', start, 1);
  if (!OPERATORS.has(text)) throw new LangError(`Unexpected character ${text}`, start, 1);
  return { kind: 'op', text, index: start, length: text.length, value: 0 };
}

export function nextToken(source: string, from: number): Token {
  let start = from;
  while (source[start] === ' ') start += 1;
  if (start >= source.length) return { kind: 'end', text: '', index: source.length, length: 0, value: 0 };
  const c = source[start];
  if (isDigit(c) || (c === '.' && isDigit(source[start + 1]))) return scanNumber(source, start);
  if (isLetter(c)) return scanName(source, start);
  return scanOperator(source, start);
}

export function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [nextToken(source, 0)];
  while (tokens[tokens.length - 1]!.kind !== 'end') {
    const last = tokens[tokens.length - 1]!;
    tokens.push(nextToken(source, last.index + last.length));
  }
  return tokens;
}
