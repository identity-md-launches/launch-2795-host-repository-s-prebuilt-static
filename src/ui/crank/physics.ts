export const TAU = Math.PI * 2;

/** Rungs on the wheel. Each one is a detent, so a slow hand feels every rung go by. */
export const DETENTS = 24;

const SUBSTEP = 0.002;
const STIFFNESS = 2600;
const DAMPING = 78;
const FLYWHEEL_DECAY = 0.62;
const BEARING_DRAG = 1.5;
const FREE_DETENT = 30;
const HELD_DETENT = 150;
const SETTLE_SPEED = 1.8;
const SETTLE_DAMPING = 7;

export interface CrankState {
  /** Radians, unbounded. One full turn is one cycle. */
  readonly theta: number;
  /** Radians per second. */
  readonly omega: number;
  /** Where the hand wants the wheel, or null when it is free. */
  readonly hand: number | null;
}

export const CRANK_AT_REST: CrankState = { theta: 0, omega: 0, hand: null };

export function hzOf(state: CrankState): number {
  return Math.abs(state.omega) / TAU;
}

export function cyclesOf(state: CrankState): number {
  return state.theta / TAU;
}

function acceleration(theta: number, omega: number, hand: number | null): number {
  if (hand !== null) {
    return (
      STIFFNESS * (hand - theta) -
      DAMPING * omega -
      HELD_DETENT * Math.sin(DETENTS * theta)
    );
  }
  const settling = Math.abs(omega) < SETTLE_SPEED ? SETTLE_DAMPING * omega : 0;
  return (
    -FLYWHEEL_DECAY * omega -
    BEARING_DRAG * Math.sign(omega) -
    settling -
    FREE_DETENT * Math.sin(DETENTS * theta)
  );
}

export function stepCrank(state: CrankState, dtSeconds: number): CrankState {
  const steps = Math.max(1, Math.ceil(Math.min(dtSeconds, 0.05) / SUBSTEP));
  const h = Math.min(dtSeconds, 0.05) / steps;
  let { theta, omega } = state;
  for (let i = 0; i < steps; i++) {
    omega += acceleration(theta, omega, state.hand) * h;
    theta += omega * h;
  }
  return { theta, omega, hand: state.hand };
}

export function grab(state: CrankState): CrankState {
  return { ...state, hand: state.theta };
}

export function release(state: CrankState, coast: boolean): CrankState {
  return { ...state, hand: null, omega: coast ? state.omega : 0 };
}

/** Advances the hand by a pointer rotation that has already been unwrapped. */
export function moveHand(state: CrankState, delta: number): CrankState {
  return { ...state, hand: (state.hand ?? state.theta) + delta };
}

export function kick(state: CrankState, omegaDelta: number): CrankState {
  return { ...state, omega: state.omega + omegaDelta };
}

/** Shortest signed rotation between two pointer angles. */
export function unwrap(from: number, to: number): number {
  const delta = (to - from) % TAU;
  if (delta > Math.PI) return delta - TAU;
  if (delta < -Math.PI) return delta + TAU;
  return delta;
}

export function detentIndex(theta: number): number {
  return Math.round((theta * DETENTS) / TAU);
}
