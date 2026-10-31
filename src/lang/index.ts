import { MAX_SOURCE_BYTES, type CompileError, type CompileResult } from '../types';
import { lower } from './codegen';
import { LangError, parse } from './parser';

export { segfaultProgram } from './segfault';

const isHighSurrogate = (code: number): boolean => code >= 0xd800 && code <= 0xdbff;

function checkBytes(source: string): CompileError | null {
  for (let k = 0; k < source.length; k += 1) {
    const code = source.charCodeAt(k);
    if (code < 0x20 || code > 0x7e) {
      return { message: 'Only printable ASCII is allowed', index: k, length: isHighSurrogate(code) ? 2 : 1 };
    }
  }
  if (source.length <= MAX_SOURCE_BYTES) return null;
  return {
    message: `Program is over ${MAX_SOURCE_BYTES} bytes`,
    index: MAX_SOURCE_BYTES,
    length: source.length - MAX_SOURCE_BYTES,
  };
}

export function compile(source: string): CompileResult {
  const invalid = checkBytes(source);
  if (invalid !== null) return { ok: false, error: invalid };
  try {
    return { ok: true, program: lower(source, parse(source)) };
  } catch (error) {
    if (!(error instanceof LangError)) throw error;
    return { ok: false, error: { message: error.message, index: error.index, length: error.length } };
  }
}
