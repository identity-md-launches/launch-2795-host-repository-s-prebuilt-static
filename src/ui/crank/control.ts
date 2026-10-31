import { prefersReducedMotion } from '../dom';
import {
  CRANK_AT_REST,
  cyclesOf,
  detentIndex,
  grab,
  hzOf,
  kick,
  moveHand,
  release,
  stepCrank,
  unwrap,
  type CrankState,
} from './physics';
import { createWheelView } from './view';

const KEY_KICK = 1.05;
const DEAD_ZONE = 0.1;
const HZ_SMOOTHING_MS = 240;

export interface CrankEvents {
  /** The hand arrived. Fires before the first cycles reach the machine. */
  onEngage(): void;
  /** Signed cycles turned since the last update. */
  onTurn(deltaCycles: number): void;
  onDetent(): void;
  onCycle(): void;
}

export interface CrankControl {
  readonly hz: number;
  readonly held: boolean;
  setInvite(on: boolean): void;
  update(dtMs: number, now: number): void;
  resize(): void;
}

export function createCrankControl(
  dial: HTMLElement,
  canvas: HTMLCanvasElement,
  events: CrankEvents,
): CrankControl {
  const view = createWheelView(canvas);
  const reduced = prefersReducedMotion();
  let state: CrankState = CRANK_AT_REST;
  let lastCycles = 0;
  let lastDetent = 0;
  let lastWhole = 0;
  let smoothHz = 0;
  let invite = false;
  let flash = 0;
  let dirty = true;
  let activePointer: number | null = null;
  let pointerAngle = 0;
  let fitted = 0;

  const pointerPolar = (event: PointerEvent): { angle: number; distance: number } => {
    const box = dial.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    return { angle: Math.atan2(y, x), distance: Math.hypot(x, y) / (box.width / 2) };
  };

  const onDown = (event: PointerEvent): void => {
    if (activePointer !== null) return;
    activePointer = event.pointerId;
    dial.setPointerCapture(event.pointerId);
    pointerAngle = pointerPolar(event).angle;
    state = grab(state);
    dial.dataset['held'] = 'true';
    dial.focus({ preventScroll: true });
    events.onEngage();
    dirty = true;
    event.preventDefault();
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== activePointer) return;
    const { angle, distance } = pointerPolar(event);
    const delta = unwrap(pointerAngle, angle);
    pointerAngle = angle;
    // Right at the centre a one pixel twitch is a huge angle, so ignore it there.
    if (distance > DEAD_ZONE) state = moveHand(state, delta);
  };

  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    state = release(state, !reduced);
    delete dial.dataset['held'];
    dirty = true;
  };

  const onKey = (event: KeyboardEvent): void => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
    const back = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
    if (forward || back) {
      events.onEngage();
      state = kick(state, forward ? KEY_KICK : -KEY_KICK);
      event.preventDefault();
      return;
    }
    if (event.key === ' ' || event.key === 'Escape') {
      state = { ...state, omega: state.omega * 0.2 };
      event.preventDefault();
    }
  };

  dial.addEventListener('pointerdown', onDown);
  dial.addEventListener('pointermove', onMove);
  dial.addEventListener('pointerup', onUp);
  dial.addEventListener('pointercancel', onUp);
  dial.addEventListener('lostpointercapture', onUp);
  dial.addEventListener('keydown', onKey);

  return {
    get hz() {
      return smoothHz;
    },
    get held() {
      return activePointer !== null;
    },
    setInvite(on) {
      invite = on;
    },
    update(dtMs, now) {
      const moving = state.hand !== null || Math.abs(state.omega) > 0.0004;
      if (moving) state = stepCrank(state, dtMs / 1000);

      const total = cyclesOf(state);
      if (total !== lastCycles) {
        events.onTurn(total - lastCycles);
        lastCycles = total;
      }
      const detent = detentIndex(state.theta);
      if (detent !== lastDetent) {
        lastDetent = detent;
        events.onDetent();
      }
      const whole = Math.floor(total);
      if (whole !== lastWhole) {
        lastWhole = whole;
        flash = 1;
        events.onCycle();
      }

      const blend = 1 - Math.exp(-dtMs / HZ_SMOOTHING_MS);
      smoothHz += (hzOf(state) - smoothHz) * blend;
      if (smoothHz < 0.004) smoothHz = 0;
      flash *= Math.exp(-dtMs / 130);
      if (flash < 0.01) flash = 0;

      const breathing = invite && !reduced;
      if (moving || flash > 0 || breathing || dirty) {
        const pulse = breathing ? 0.5 + 0.5 * Math.sin(now / 760) : invite ? 0.5 : 0;
        const held = activePointer !== null;
        view.paint({ state, invite: pulse, attract: breathing && !held, held, flash, now });
        dirty = false;
      }

      const rpm = Math.round(smoothHz * 60);
      const value = dial.getAttribute('aria-valuenow');
      if (value !== String(rpm)) {
        dial.setAttribute('aria-valuenow', String(rpm));
        dial.setAttribute('aria-valuetext', `${smoothHz.toFixed(1)} hertz`);
      }
    },
    resize() {
      if (dial.clientWidth === fitted) return;
      fitted = dial.clientWidth;
      view.fit(fitted);
      dirty = true;
    },
  };
}
