import { describe, expect, it } from 'vitest';
import {
  CRANK_AT_REST,
  DETENTS,
  TAU,
  cyclesOf,
  grab,
  hzOf,
  kick,
  moveHand,
  release,
  stepCrank,
  unwrap,
  type CrankState,
} from './physics';

function run(state: CrankState, seconds: number): CrankState {
  let next = state;
  for (let t = 0; t < seconds; t += 1 / 60) next = stepCrank(next, 1 / 60);
  return next;
}

describe('crank physics', () => {
  it('counts one full turn as one cycle', () => {
    expect(cyclesOf({ theta: TAU, omega: 0, hand: null })).toBeCloseTo(1);
    expect(cyclesOf({ theta: -TAU * 2, omega: 0, hand: null })).toBeCloseTo(-2);
  });

  it('follows a hand closely enough to feel direct', () => {
    let state = grab(CRANK_AT_REST);
    let halfway = 0;
    for (let frame = 0; frame < 120; frame++) {
      state = stepCrank(moveHand(state, TAU / 60), 1 / 60);
      if (frame === 59) halfway = cyclesOf(state);
    }
    expect(cyclesOf(state)).toBeGreaterThan(1.9);
    expect(cyclesOf(state)).toBeLessThan(2.02);
    // Instantaneous speed ripples through the detents by design, so judge the average.
    expect(cyclesOf(state) - halfway).toBeCloseTo(1, 1);
  });

  it('keeps its momentum when released', () => {
    const spinning = release(run(kick(grab(CRANK_AT_REST), 0), 0), true);
    const flung = run({ ...spinning, omega: TAU * 3 }, 0.5);
    expect(hzOf(flung)).toBeGreaterThan(1.5);
    expect(cyclesOf(flung)).toBeGreaterThan(1);
  });

  it('spins down and comes to rest in a detent, without gaining energy', () => {
    let state: CrankState = { ...CRANK_AT_REST, omega: TAU * 4 };
    let peak = hzOf(state);
    for (let second = 0; second < 20; second++) {
      state = run(state, 1);
      peak = Math.max(peak, hzOf(state));
    }
    expect(peak).toBeLessThanOrEqual(4.01);
    expect(hzOf(state)).toBeLessThan(0.01);
    const notch = TAU / DETENTS;
    const offset = Math.abs(state.theta / notch - Math.round(state.theta / notch));
    expect(offset).toBeLessThan(0.02);
  });

  it('stops dead on release when coasting is off', () => {
    const state = release({ theta: 1, omega: 20, hand: 1 }, false);
    expect(state.omega).toBe(0);
    expect(state.hand).toBeNull();
  });

  it('unwraps pointer angles across the seam', () => {
    expect(unwrap(3.1, -3.1)).toBeCloseTo(TAU - 6.2);
    expect(unwrap(-3.1, 3.1)).toBeCloseTo(6.2 - TAU);
    expect(unwrap(0.2, 0.5)).toBeCloseTo(0.3);
  });
});
