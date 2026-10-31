import { bench, describe } from 'vitest';
import { PRESETS } from '../machine/presets';
import { createFrame } from '../types';
import { compile, segfaultProgram } from './index';

const out = createFrame();
let t = 0;

const benchSource = (name: string, source: string): void => {
  const result = compile(source);
  if (!result.ok) throw new Error(result.error.message);
  const { program } = result;
  bench(name, () => {
    t += 1 / 60;
    program.render(t, out);
  });
};

describe('one frame of 2304 cells', () => {
  PRESETS.forEach((preset) => benchSource(preset.name, preset.source));
  bench('SEGFAULT screen', () => {
    t += 1 / 60;
    segfaultProgram.render(t, out);
  });
});

describe('compile, once per keystroke', () => {
  const source = PRESETS[1]?.source ?? 'x';
  bench('longest preset', () => {
    compile(source);
  });
});
