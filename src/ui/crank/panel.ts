import { helpTip, panelBar } from '../chrome';
import { h, setData, setText } from '../dom';
import { hz as formatHz } from '../format';
import type { HamsterReading } from '../../types';
import { createCrankControl, type CrankControl, type CrankEvents } from './control';

const SCALE_HZ = 4;
const BEST_KEY = 'turing-wheel:best-hz:v2';

function loadBest(): { you: number; hamster: number } {
  try {
    const raw = window.localStorage.getItem(BEST_KEY);
    const parsed = raw ? (JSON.parse(raw) as { you?: unknown; hamster?: unknown }) : {};
    return {
      you: typeof parsed.you === 'number' ? parsed.you : 0,
      hamster: typeof parsed.hamster === 'number' ? parsed.hamster : 0,
    };
  } catch {
    return { you: 0, hamster: 0 };
  }
}

function saveBest(best: { you: number; hamster: number }): void {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    return;
  }
}

export function verdict(you: number, reading: HamsterReading | null): string {
  const running = reading?.state === 'running' && reading.hz > 0.05;
  if (you < 0.04) {
    if (running) return 'He is working. You could help.';
    if (reading?.state === 'asleep') return 'He is asleep. The job is open.';
    return 'Drag the wheel in circles.';
  }
  if (!running) {
    if (you < 0.6) return 'Slow, but the fastest CPU awake.';
    if (you < 2) return 'Infinitely faster than a sleeping hamster.';
    return 'Overclocked. Nobody asked for this.';
  }
  const ratio = you / (reading?.hz ?? 1);
  if (ratio < 0.5) return 'He is lapping you.';
  if (ratio < 0.92) return 'Close. He is not trying.';
  if (ratio < 1.1) return 'Dead heat. Tell nobody.';
  if (ratio < 2) return `${ratio.toFixed(1)}x hamster. He has not noticed.`;
  return `${ratio.toFixed(1)}x hamster. Your wrist will remember this.`;
}

interface VersusRow {
  readonly element: HTMLElement;
  set(hz: number, text: string): void;
}

function versusRow(name: string, tone: string): VersusRow {
  const value = h('b', { class: 'versus__value' }, '0.00');
  const meter = h('i', { class: 'versus__meter', 'data-tone': tone, 'aria-hidden': 'true' });
  return {
    element: h('div', { class: 'versus__row' }, h('span', { class: 'versus__name' }, name), meter, value),
    set(hz, text) {
      const steps = Math.round((Math.min(hz, SCALE_HZ) / SCALE_HZ) * 28);
      const next = String(steps / 28);
      if (meter.style.getPropertyValue('--v') !== next) meter.style.setProperty('--v', next);
      setText(value, text);
    },
  };
}

export interface CrankPanel {
  readonly hero: HTMLElement;
  readonly control: CrankControl;
  sync(reading: HamsterReading | null, lit: boolean, now: number): void;
}

export function createCrankPanel(events: CrankEvents, sim: boolean): CrankPanel {
  const canvas = h('canvas', { class: 'dial__wheel', 'aria-hidden': 'true' });
  const hubValue = h('b', { class: 'dial__hz' }, '0.00');
  const hubLabel = h('span', { class: 'dial__label' }, 'HZ');
  const dial = h(
    'div',
    {
      class: 'dial',
      role: 'slider',
      tabIndex: 0,
      'aria-label': 'Hand crank. Use the arrow keys to turn it.',
      'aria-valuemin': '0',
      'aria-valuemax': '600',
      'aria-valuenow': '0',
      'aria-valuetext': '0 hertz',
    },
    canvas,
    h('div', { class: 'dial__hub' }, hubValue, hubLabel),
  );

  const you = versusRow('YOU', 'gold');
  const hamster = versusRow('HAMSTER', 'blue');
  const best = h('span', { class: 'versus__best' }, '');
  const line = h('p', { class: 'verdict' }, 'Drag the wheel in circles.');
  const { bar, lamp } = panelBar(
    'The Crank',
    'amber',
    h('span', { class: 'bar__spacer' }),
    best,
    helpTip(
      'About the crank',
      'Each full turn is one cycle, the same unit the hamster clocks. Your cranking is private to this screen. Arrow keys spin it, Space brakes.',
    ),
  );

  const hero = h(
    'section',
    { class: 'panel crank', 'aria-label': 'The Crank' },
    bar,
    h('div', { class: 'crank__body' }, dial, h('div', { class: 'versus' }, you.element, hamster.element), line),
  );

  const control = createCrankControl(dial, canvas, events);
  const record = loadBest();
  let lastLine = 0;
  let saved = record.you + record.hamster;

  return {
    hero,
    control,
    sync(reading, lit, now) {
      const mine = control.hz;
      setText(hubValue, formatHz(mine));
      setData(dial, 'lit', lit ? 'true' : 'false');
      setData(lamp, 'tone', mine > 0.04 ? 'gold' : lit ? 'green' : 'amber');
      you.set(mine, formatHz(mine));

      const running = reading?.state === 'running';
      const theirs = running ? reading.hz : 0;
      hamster.set(theirs, running ? formatHz(theirs) : reading?.state === 'asleep' ? 'ASLEEP' : '--');

      record.you = Math.max(record.you, mine);
      // A simulated hamster must never leave a mark on the record of the real one.
      if (!sim) record.hamster = Math.max(record.hamster, theirs);
      const parts = [
        record.you >= 0.05 ? `YOU ${formatHz(record.you)}` : '',
        record.hamster > 0 ? `HIM ${formatHz(record.hamster)}` : '',
      ].filter(Boolean);
      setText(best, parts.length > 0 ? `BEST ${parts.join(' / ')}` : '');

      if (now - lastLine > 420) {
        lastLine = now;
        setText(line, verdict(mine, reading));
        const total = record.you + record.hamster;
        if (total !== saved) {
          saved = total;
          saveBest(record);
        }
      }
    },
  };
}
