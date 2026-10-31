import { describe, expect, it } from 'vitest';
import { compile } from '../lang';
import { CELLS, MAX_SOURCE_BYTES, SLICE_PASSES, createFrame, type Frame, type Preset, type Program } from '../types';
import { HOUSE_ROM, PRESETS } from './presets';

const build = ({ source, name }: Preset): Program => {
  const result = compile(source);
  if (!result.ok) throw new Error(`${name}: ${result.error.message} at ${result.error.index}`);
  return result.program;
};

const render = (program: Program, t: number): Frame => {
  const out = createFrame();
  program.render(t, out);
  return out;
};

const changed = (a: Frame, b: Frame): number => a.reduce((sum, value, k) => sum + (value === b[k] ? 0 : 1), 0);

const SAMPLES = Array.from({ length: 64 }, (_, k) => k * 8 + 0.37);

describe('the preset list', () => {
  it('has at least 14 presets', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(14);
  });

  it('has unique names and sources', () => {
    expect(new Set(PRESETS.map((preset) => preset.name)).size).toBe(PRESETS.length);
    expect(new Set(PRESETS.map((preset) => preset.source)).size).toBe(PRESETS.length);
  });
});

describe('the house ROM', () => {
  it('has at least 6 programs', () => {
    expect(HOUSE_ROM.length).toBeGreaterThanOrEqual(6);
  });

  it('is drawn from the presets', () => {
    HOUSE_ROM.forEach((preset) => expect(PRESETS).toContain(preset));
  });

  it('never repeats a program', () => {
    expect(new Set(HOUSE_ROM).size).toBe(HOUSE_ROM.length);
  });
});

PRESETS.forEach((preset) => {
  describe(preset.name, () => {
    const program = build(preset);
    const frames = SAMPLES.map((t) => render(program, t));

    it(`fits in ${MAX_SOURCE_BYTES} bytes of printable ASCII`, () => {
      expect(preset.source.length).toBeLessThanOrEqual(MAX_SOURCE_BYTES);
      expect(preset.source).toMatch(/^[\x20-\x7e]+$/);
    });

    it('has a short name and a one-line note, free of em dashes', () => {
      expect(preset.name.length).toBeGreaterThan(0);
      expect(preset.name.length).toBeLessThanOrEqual(24);
      expect(preset.note.length).toBeGreaterThan(0);
      expect(preset.note.length).toBeLessThanOrEqual(72);
      expect(`${preset.name}${preset.note}`).not.toMatch(/[\u2013\u2014\n]/);
    });

    it('never goes dark', () => {
      frames.forEach((frame) => {
        expect(frame.some((value) => value !== 0)).toBe(true);
      });
    });

    it('lights enough of the panel to read from across a room', () => {
      const lit = frames.reduce((sum, frame) => sum + frame.reduce((n, value) => n + (value === 0 ? 0 : 1), 0), 0);
      expect(lit / (frames.length * CELLS)).toBeGreaterThan(0.02);
    });

    it('uses both phosphors', () => {
      const all = frames.flatMap((frame) => [...frame]);
      expect(all.filter((value) => value > 0).length / all.length).toBeGreaterThan(0.002);
      expect(all.filter((value) => value < 0).length / all.length).toBeGreaterThan(0.002);
    });

    it('keeps moving at a hamster pace', () => {
      const moved = SAMPLES.reduce((sum, t) => sum + changed(render(program, t), render(program, t + 2)), 0);
      expect(moved / (SAMPLES.length * CELLS)).toBeGreaterThan(0.003);
    });

    it('varies across the slice instead of looping tightly', () => {
      expect(new Set(frames.map((frame) => frame.join())).size).toBeGreaterThan(8);
    });

    it('flows rather than strobes at 60 frames per second', () => {
      const flicker = SAMPLES.reduce((sum, t) => sum + changed(render(program, t), render(program, t + 1 / 60)), 0);
      expect(flicker / (SAMPLES.length * CELLS)).toBeLessThan(0.08);
    });

    it('survives the first and last cycles of a slice', () => {
      expect(() => render(program, 0)).not.toThrow();
      expect(() => render(program, SLICE_PASSES - 0.001)).not.toThrow();
    });
  });
});
