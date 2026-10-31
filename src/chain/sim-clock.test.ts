import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HamsterClock, HamsterReading } from '../types';
import { createSimClock } from './sim-clock';
import { T0 } from './test-helpers';

const HOUR = 3_600_000;
const clocks: HamsterClock[] = [];
const sim = (now?: () => number) => {
  const clock = createSimClock(now ? { now } : {});
  clocks.push(clock);
  return clock;
};

function sample(clock: HamsterClock, spanMs = 2 * HOUR, stepMs = 1_000): HamsterReading[] {
  return Array.from({ length: spanMs / stepMs }, (_, step) => clock.read(T0 + step * stepMs));
}

afterEach(() => {
  clocks.splice(0).forEach((clock) => clock.stop());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('createSimClock', () => {
  it('gives every viewer the same reading for the same instant', () => {
    expect(sim().read(T0 + 123_456)).toEqual(sim().read(T0 + 123_456));
  });

  it('never steps backwards', () => {
    const readings = sample(sim());
    readings.slice(1).forEach((reading, index) => {
      expect(reading.work).toBeGreaterThanOrEqual(readings[index]?.work ?? 0);
    });
  });

  it('both runs and naps, for a believable share of the time', () => {
    const readings = sample(sim());
    const running = readings.filter((reading) => reading.state === 'running').length / readings.length;
    expect(running).toBeGreaterThan(0.4);
    expect(running).toBeLessThan(0.9);
    expect(new Set(readings.map((reading) => reading.state))).toEqual(new Set(['running', 'asleep']));
  });

  it('runs at hamster speed and varies its pace', () => {
    const speeds = sample(sim()).filter((reading) => reading.state === 'running').map((reading) => reading.hz);
    expect(Math.min(...speeds)).toBeGreaterThan(0.2);
    expect(Math.max(...speeds)).toBeLessThan(2.5);
    expect(new Set(speeds).size).toBeGreaterThan(2);
  });

  it('advances work at the speed it reports', () => {
    const clock = sim();
    const readings = sample(clock);
    readings.slice(1).forEach((reading, index) => {
      const previous = readings[index];
      if (previous?.state === 'running' && reading.state === 'running' && previous.hz === reading.hz) {
        expect(reading.work - previous.work).toBeCloseTo(previous.hz, 6);
      }
    });
  });

  it('freezes exactly while he naps, with rpm and hz at zero', () => {
    const readings = sample(sim());
    const nap = readings.findIndex((reading) => reading.state === 'asleep');
    const first = readings[nap];
    const second = readings[nap + 1];
    expect(first).toMatchObject({ hz: 0, rpm: 0 });
    expect(second?.state).toBe('asleep');
    expect(second?.work).toBe(first?.work);
  });

  it('keeps hz and rpm consistent while running', () => {
    const running = sample(sim()).find((reading) => reading.state === 'running');
    expect(running?.rpm).toBeCloseTo((running?.hz ?? 0) * 60, 9);
  });

  it('names the instant the nap ends, and only during naps', () => {
    const clock = sim();
    const readings = sample(clock);
    expect(readings.filter((reading) => reading.state === 'running').every((reading) => reading.nextLiveAt === null)).toBe(true);

    const nap = readings.find((reading) => reading.state === 'asleep');
    const wakes = nap?.nextLiveAt ?? 0;
    expect(clock.read(wakes - 1).state).toBe('asleep');
    expect(clock.read(wakes).state).toBe('running');
  });

  it('reports recent telemetry so a QA session never reads as signal-lost', () => {
    const reading = sim().read(T0 + 37_000);
    expect(reading.observedAt).toBeGreaterThan(T0 + 37_000 - 15_000);
    expect(reading.observedAt).toBeLessThanOrEqual(T0 + 37_000);
  });

  it('touches no network', async () => {
    const network = vi.fn();
    vi.stubGlobal('fetch', network);
    vi.useFakeTimers({ now: T0 });
    const clock = sim();
    clock.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(30_000);
    expect(network).not.toHaveBeenCalled();
  });

  it('pushes readings to subscribers until stopped', async () => {
    vi.useFakeTimers({ now: T0 });
    const clock = sim();
    const readings: HamsterReading[] = [];
    clock.subscribe((reading) => readings.push(reading));
    await vi.advanceTimersByTimeAsync(3_000);
    expect(readings).toHaveLength(3);
    clock.stop();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(readings).toHaveLength(3);
  });

  it('leaves no timer running after stop', () => {
    vi.useFakeTimers({ now: T0 });
    sim().stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('uses the injected clock for what it pushes', async () => {
    vi.useFakeTimers({ now: T0 });
    const clock = sim(() => T0 + HOUR);
    const readings: HamsterReading[] = [];
    clock.subscribe((reading) => readings.push(reading));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(readings[0]).toEqual(clock.read(T0 + HOUR));
  });
});
