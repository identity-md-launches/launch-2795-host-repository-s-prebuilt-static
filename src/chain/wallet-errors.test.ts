import { describe, expect, it } from 'vitest';
import { sourceProblem } from './wallet-errors';

describe('sourceProblem', () => {
  it.each<[string, string]>([
    ['one character', 'x'],
    ['exactly 140 bytes', 'x'.repeat(140)],
    ['space, the lowest printable', ' '],
    ['tilde, the highest printable', '~'],
    ['a real program', 'sin(x/9+t)*cos(y/7)>.2?1:-1'],
  ])('accepts %s', (_name, source) => {
    expect(sourceProblem(source)).toBeNull();
  });

  it.each<[string, string, RegExp]>([
    ['nothing', '', /empty/i],
    ['141 bytes', 'x'.repeat(141), /140/],
    ['a newline', 'a\nb', /ascii/i],
    ['a tab', 'a\tb', /ascii/i],
    ['a carriage return', 'a\rb', /ascii/i],
    ['DEL, one past printable', 'a\u007f', /ascii/i],
    ['a unit separator, one below printable', 'a\u001f', /ascii/i],
    ['an accented letter', 'café', /ascii/i],
    ['an emoji', 't\u{1f439}', /ascii/i],
  ])('refuses %s', (_name, source, wording) => {
    expect(sourceProblem(source)).toMatch(wording);
  });

  it('counts bytes, not characters', () => {
    expect(sourceProblem('é'.repeat(71))).toMatch(/140/);
  });

  it('reports length before ASCII, matching the contract revert order', () => {
    expect(sourceProblem(`${'x'.repeat(141)}\n`)).toMatch(/140/);
  });
});
