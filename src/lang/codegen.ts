import { CELLS, type Frame, type Program } from '../types';
import { GRID } from './grid';
import { OPS, type Instruction, type Register } from './ops';
import type { Expr } from './parser';

interface Value {
  readonly register: Register;
  /** One slot, the same for every cell. Otherwise CELLS slots. */
  readonly uniform: boolean;
  readonly constant: boolean;
  /** Lives in the shared scratch stack, so later siblings must not clobber it. */
  readonly scratch: boolean;
}

// Shared by all programs: render is synchronous, so nothing overlaps, and a queue full of
// thumbnails need not hold a megabyte of buffers per program.
const pool: Register[] = [];

function scratch(slot: number): Register {
  pool[slot] ??= new Float64Array(CELLS);
  return pool[slot];
}

function levelOf(value: number): number {
  if (value > 0) return value < 1 ? (value * 4 + 0.5) | 0 : value === Infinity ? 0 : 4;
  if (value < 0) return value > -1 ? -((0.5 - value * 4) | 0) : value === -Infinity ? 0 : -4;
  return 0;
}

function writeLevels(values: Register, out: Frame): void {
  for (let k = 0; k < CELLS; k += 1) out[k] = levelOf(values[k]!);
}

export function lower(source: string, tree: Expr): Program {
  const instructions: Instruction[] = [];
  const time = new Float64Array(1);

  const frameValue = (register: Register, constant: boolean): Value => ({
    register,
    uniform: true,
    constant,
    scratch: false,
  });

  const visitCall = (op: keyof typeof OPS, args: readonly Expr[], slot: number): Value => {
    let free = slot;
    const values = args.map((arg) => {
      const value = visit(arg, free);
      if (value.scratch) free += 1;
      return value;
    });

    if (values.every((value) => value.uniform)) {
      const result = new Float64Array(1);
      const first = values[0]!.register;
      const instruction = OPS[op](result, 1, first, values[1]?.register ?? first, values[2]?.register ?? first);
      const constant = values.every((value) => value.constant);
      if (constant) instruction();
      else instructions.push(instruction);
      return frameValue(result, constant);
    }

    const operands = values.map((value) => {
      if (!value.uniform) return value.register;
      const spread = scratch(free);
      free += 1;
      const single = value.register;
      instructions.push(() => spread.fill(single[0]!));
      return spread;
    });

    const result = scratch(slot);
    const first = operands[0]!;
    instructions.push(OPS[op](result, CELLS, first, operands[1] ?? first, operands[2] ?? first));
    return { register: result, uniform: false, constant: false, scratch: true };
  };

  const visit = (e: Expr, slot: number): Value => {
    if (e.kind === 'num') return frameValue(Float64Array.of(e.value), true);
    if (e.kind === 'call') return visitCall(e.op, e.args, slot);
    if (e.name === 't') return frameValue(time, false);
    return { register: GRID[e.name], uniform: false, constant: false, scratch: false };
  };

  const result = visit(tree, 0);
  const output = result.register;
  const uniform = result.uniform;
  const count = instructions.length;

  return {
    source,
    render(t: number, out: Frame): void {
      time[0] = t;
      for (let k = 0; k < count; k += 1) instructions[k]!();
      if (uniform) out.fill(levelOf(output[0]!));
      else writeLevels(output, out);
    },
  };
}
