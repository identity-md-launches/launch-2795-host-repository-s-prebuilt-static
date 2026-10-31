import { describe, expect, it } from 'vitest';

const sources = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const productionFiles = Object.entries(sources).filter(([path]) => !/\.(test|bench)\.ts$/.test(path));

/** Blanks comments, strings and regex-free template text so only live code is scanned. */
const liveCode = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/.*$/gm, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');

const BANNED_NAMES = [
  'eval', 'Function', 'Date', 'Reflect', 'Proxy', 'globalThis', 'window', 'self', 'document', 'navigator',
  'location', 'localStorage', 'sessionStorage', 'indexedDB', 'fetch', 'XMLHttpRequest', 'WebSocket', 'require',
  'process', 'crypto', 'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'Atomics', 'Worker',
];

const ALLOWED_MATH = new Set(['floor', 'abs', 'sqrt']);

const violations = (text: string): string[] => {
  const code = liveCode(text);
  const mathUses = [...code.matchAll(/\bMath\b(?:\s*\.\s*(\w+))?/g)]
    .filter((match) => match[1] === undefined || !ALLOWED_MATH.has(match[1]))
    .map((match) => match[0]);
  const names = BANNED_NAMES.filter((name) => new RegExp(`\\b${name}\\b`).test(code));
  const power = code.includes('**') ? ['**'] : [];
  const dynamicImport = /\bimport\s*\(/.test(code) ? ['import('] : [];
  return [...mathUses, ...names, ...power, ...dynamicImport];
};

describe('the scanner itself', () => {
  [
    'Math.sin(x)',
    'Math.cos(x)',
    'Math.tan(x)',
    'Math.atan2(y, x)',
    'Math.pow(x, 2)',
    'Math.exp(x)',
    'Math.log(x)',
    'Math.hypot(x, y)',
    'Math.random()',
    'Math.imul(a, b)',
    'const { sin } = Math;',
    'Math["sin"](x)',
    'Math . sin(x)',
    'x ** 2',
    'eval(source)',
    'new Function(source)',
    'Date.now()',
    'window.top',
    'await import(url)',
  ].forEach((snippet) => {
    it(`catches ${snippet}`, () => {
      expect(violations(snippet)).not.toEqual([]);
    });
  });

  it('allows the three exact functions', () => {
    expect(violations('Math.floor(x) + Math.abs(y) + Math.sqrt(z)')).toEqual([]);
  });

  it('ignores comments and strings', () => {
    expect(violations("// Math.sin\n/* eval */ const op = '**';")).toEqual([]);
  });
});

describe('src/lang', () => {
  it('finds the production files', () => {
    const names = productionFiles.map(([path]) => path);
    expect(names).toContain('./dmath.ts');
    expect(names).toContain('./index.ts');
    expect(names).not.toContain('./purity.test.ts');
  });

  productionFiles.forEach(([path, text]) => {
    it(`${path} uses no forbidden math or host access`, () => {
      expect(violations(text)).toEqual([]);
    });
  });
});
