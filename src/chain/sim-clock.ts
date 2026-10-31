import type { HamsterClock, HamsterReading } from '../types';
import { createEmitter } from './emitter';

export interface SimClockOptions {
  readonly now?: () => number;
}

const SIM_EPOCH = Date.UTC(2026, 0, 1);
const TICK_MS = 1_000;
const HEARTBEAT_MS = 10_000;

/** One loop of an invented evening. Every number here is made up. Hz 0 is a nap. */
const PATTERN: readonly { readonly seconds: number; readonly hz: number }[] = [
  { seconds: 70, hz: 1.2 },
  { seconds: 35, hz: 1.7 },
  { seconds: 20, hz: 0.6 },
  { seconds: 40, hz: 0 },
  { seconds: 90, hz: 1.4 },
  { seconds: 25, hz: 0.9 },
  { seconds: 45, hz: 1.9 },
  { seconds: 120, hz: 0 },
  { seconds: 60, hz: 1.1 },
  { seconds: 30, hz: 0.7 },
  { seconds: 15, hz: 1.5 },
  { seconds: 75, hz: 0 },
];

interface Phase {
  readonly hz: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly startWork: number;
}

const PHASES = PATTERN.reduce<readonly Phase[]>((phases, { seconds, hz }) => {
  const previous = phases.at(-1);
  const startMs = previous?.endMs ?? 0;
  const startWork = previous === undefined ? 0 : previous.startWork + (previous.hz * (previous.endMs - previous.startMs)) / 1_000;
  return [...phases, { hz, startMs, endMs: startMs + seconds * 1_000, startWork }];
}, []);

const lastPhase = PHASES[PHASES.length - 1] as Phase;
const LOOP_MS = lastPhase.endMs;
const LOOP_WORK = lastPhase.startWork + (lastPhase.hz * (lastPhase.endMs - lastPhase.startMs)) / 1_000;

/** QA only, behind ?sim=1, and the page must say SIMULATED. Readings depend on time alone, so every tab agrees. */
export function createSimClock(options: SimClockOptions = {}): HamsterClock {
  const now = options.now ?? Date.now;
  const emitter = createEmitter<HamsterReading>();

  function read(time: number): HamsterReading {
    const elapsed = Math.max(0, time - SIM_EPOCH);
    const loops = Math.floor(elapsed / LOOP_MS);
    const offset = elapsed - loops * LOOP_MS;
    const phase = PHASES.find(({ endMs }) => offset < endMs) ?? lastPhase;
    const asleep = phase.hz === 0;
    return {
      work: loops * LOOP_WORK + phase.startWork + (phase.hz * (offset - phase.startMs)) / 1_000,
      hz: phase.hz,
      rpm: phase.hz * 60,
      state: asleep ? 'asleep' : 'running',
      observedAt: time - (time % HEARTBEAT_MS),
      nextLiveAt: asleep ? time + phase.endMs - offset : null,
    };
  }

  const timer = setInterval(() => emitter.emit(read(now())), TICK_MS);

  return {
    read,
    subscribe: emitter.subscribe,
    stop() {
      clearInterval(timer);
      emitter.clear();
    },
  };
}
