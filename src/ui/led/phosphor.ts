import { CELLS } from '../../types';

const ATTACK_MS = 34;
const GOLD_DECAY_MS = 260;
const BLUE_DECAY_MS = 170;

export interface Phosphor {
  /** Interleaved per cell: gold heat, blue heat. Ready to upload as an RG texture. */
  readonly heat: Float32Array;
  /** Signed targets per cell, -1..1. */
  step(targets: Float32Array, dtMs: number): void;
  /** Snaps to targets so the first paint or a reduced-motion step has no fade-in. */
  settle(targets: Float32Array): void;
}

export function createPhosphor(): Phosphor {
  const heat = new Float32Array(CELLS * 2);

  return {
    heat,
    step(targets, dtMs) {
      const dt = Math.min(dtMs, 100);
      const rise = 1 - Math.exp(-dt / ATTACK_MS);
      const goldFall = 1 - Math.exp(-dt / GOLD_DECAY_MS);
      const blueFall = 1 - Math.exp(-dt / BLUE_DECAY_MS);
      for (let i = 0; i < CELLS; i++) {
        const value = targets[i] as number;
        const goldTarget = value > 0 ? value : 0;
        const blueTarget = value < 0 ? -value : 0;
        const gold = heat[i * 2] as number;
        const blue = heat[i * 2 + 1] as number;
        heat[i * 2] = gold + (goldTarget - gold) * (goldTarget > gold ? rise : goldFall);
        heat[i * 2 + 1] = blue + (blueTarget - blue) * (blueTarget > blue ? rise : blueFall);
      }
    },
    settle(targets) {
      for (let i = 0; i < CELLS; i++) {
        const value = targets[i] as number;
        heat[i * 2] = value > 0 ? value : 0;
        heat[i * 2 + 1] = value < 0 ? -value : 0;
      }
    },
  };
}
