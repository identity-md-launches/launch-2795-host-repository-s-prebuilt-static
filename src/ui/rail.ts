import { SLICE_PASSES } from '../types';
import { h, setData, setText } from './dom';
import { cycles, hz as formatHz, secondsAgo } from './format';
import type { ClockSource, DisplayInfo, Scene } from './machine';

const SOURCE_LABEL: Record<ClockSource, string> = {
  hamster: 'HAMSTER',
  crank: 'YOUR HAND',
  bench: 'BENCH',
  replay: 'REPLAY',
};

const BITS = 16;
const GAUGE_MAX_HZ = 3;

function cell(channel: string, ghost: string, body: readonly (Node | null)[], name: string): HTMLElement {
  return h(
    'div',
    { class: `cell cell--${name}` },
    h('div', { class: 'cell__head' }, h('span', { class: 'cell__ch' }, channel), h('span', { class: 'cell__ghost' }, ghost)),
    ...body,
  );
}

function gauge(tone: string): { readonly element: HTMLElement; set(value: number): void } {
  const fill = h('i', { class: 'gauge__fill' });
  const element = h('div', { class: 'gauge', 'data-tone': tone, 'aria-hidden': 'true' }, fill);
  let current = -1;
  return {
    element,
    set(value) {
      const next = Math.round(Math.min(1, Math.max(0, value)) * 500) / 500;
      if (next === current) return;
      current = next;
      element.style.setProperty('--v', String(next));
    },
  };
}

function stateLine(scene: Scene): { text: string; tone: string } {
  switch (scene) {
    case 'live':
      return { text: 'RUNNING', tone: 'green' };
    case 'halted':
      return { text: 'ASLEEP', tone: 'amber' };
    case 'lost':
      return { text: 'SIGNAL LOST', tone: 'red' };
    case 'fault':
      return { text: 'COUNTER FAULT', tone: 'red' };
    case 'acquiring':
      return { text: 'ACQUIRING', tone: 'dim' };
  }
}

export interface Rail {
  readonly element: HTMLElement;
  update(info: DisplayInfo, now: number): void;
  /** Called on every cycle edge so the CLK lamp blinks with the real clock. */
  pulse(): void;
}

export function createRail(sim: boolean): Rail {
  const sourceValue = h('div', { class: 'cell__value cell__value--word' }, 'HAMSTER');
  const stateLamp = h('span', { class: 'lamp', 'data-tone': 'dim', 'aria-hidden': 'true' });
  const stateText = h('span', {}, 'ACQUIRING');

  const hzValue = h('span', { class: 'cell__num' }, '0.00');
  const rpmText = h('span', {}, '0 RPM');
  const hzGauge = gauge('gold');

  const cycleValue = h('span', { class: 'cell__num' }, '0');
  const clkLamp = h('span', { class: 'lamp lamp--clk', 'data-tone': 'dim', 'aria-hidden': 'true' });
  const bits = Array.from({ length: BITS }, () => h('i', { class: 'bit' }));
  const bitRow = h('div', { class: 'bits', 'aria-hidden': 'true' }, clkLamp, ...bits);

  const programValue = h('div', { class: 'cell__value cell__value--word cell__value--fit' }, 'WAITING');
  const authorText = h('span', {}, 'NO AUTHOR YET');

  const leftValue = h('span', { class: 'cell__num' }, '0');
  const sliceText = h('span', {}, `OF ${SLICE_PASSES} CYCLES`);
  const sliceGauge = gauge('green');

  const element = h(
    'section',
    { class: 'rail', 'aria-label': 'Machine telemetry' },
    cell('CH 01', 'CLOCK SOURCE', [
      sourceValue,
      h('div', { class: 'cell__sub' }, stateLamp, stateText),
    ], 'source'),
    cell('CH 02', 'CLOCK SPEED', [
      h('div', { class: 'cell__value' }, hzValue, h('span', { class: 'cell__unit' }, 'HZ')),
      hzGauge.element,
      h('div', { class: 'cell__sub' }, rpmText),
    ], 'speed'),
    cell('CH 03', 'CYCLES', [
      h('div', { class: 'cell__value' }, cycleValue),
      bitRow,
    ], 'cycles'),
    cell('CH 04', 'PROGRAM', [
      programValue,
      h('div', { class: 'cell__sub' }, authorText),
    ], 'program'),
    cell('CH 05', 'SLICE', [
      h('div', { class: 'cell__value' }, leftValue, h('span', { class: 'cell__unit' }, 'LEFT')),
      sliceGauge.element,
      h('div', { class: 'cell__sub' }, sliceText),
    ], 'slice'),
  );

  let lastBits = -1;
  let pulseUntil = 0;

  return {
    element,
    pulse() {
      pulseUntil = performance.now() + 90;
      setData(clkLamp, 'tone', 'gold');
    },
    update(info, now) {
      setText(sourceValue, SOURCE_LABEL[info.source]);

      const hamster = stateLine(info.hamsterScene);
      const observed = info.reading?.observedAt ?? 0;
      const seen = sim ? 'SIMULATED' : `SEEN ${secondsAgo(Date.now(), observed)}`;
      setText(stateText, observed ? `${hamster.text} / ${seen}` : hamster.text);
      setData(stateLamp, 'tone', hamster.tone);

      // Lost and fault readings carry a 0 that means nothing, so it must not read as a measurement.
      const measured = info.source !== 'hamster' || info.hamsterScene === 'live' || info.hamsterScene === 'halted';
      setText(hzValue, measured ? formatHz(info.hz) : '--');
      setText(rpmText, measured ? `${Math.round(info.hz * 60)} RPM` : '-- RPM');
      hzGauge.set(measured ? info.hz / GAUGE_MAX_HZ : 0);

      // Before the first reading work is a placeholder 0, not a cycle count.
      const counted = info.source !== 'hamster' || observed > 0;
      setText(cycleValue, counted ? cycles(Math.max(0, info.cycle)) : '--');
      const value = counted ? Math.floor(Math.max(0, info.cycle)) & 0xffff : 0;
      if (value !== lastBits) {
        lastBits = value;
        bits.forEach((bit, index) => {
          const on = (value >> (BITS - 1 - index)) & 1;
          bit.dataset['on'] = on ? '1' : '0';
        });
      }

      const slot = info.slot;
      setText(programValue, info.title || 'WAITING');
      setText(authorText, info.byline || 'NO SIGNAL, NO SCHEDULE');
      if (info.source === 'hamster' && slot) {
        setText(leftValue, cycles(slot.remaining));
        sliceGauge.set(1 - slot.remaining / SLICE_PASSES);
        setText(sliceText, `OF ${SLICE_PASSES} CYCLES`);
      } else {
        setText(leftValue, '--');
        sliceGauge.set(0);
        setText(sliceText, info.source === 'hamster' ? 'WAITING FOR THE WHEEL' : 'NOT ON THE WHEEL');
      }

      if (pulseUntil && now > pulseUntil) {
        pulseUntil = 0;
        setData(clkLamp, 'tone', 'dim');
      }
    },
  };
}
