import { MAX_SOURCE_BYTES, type CompileError, type CompileResult, type Frame, type Preset, type Program } from '../../types';
import { sourceProblem } from '../../chain/wallet-errors';
import { compile } from '../../lang';
import { helpTip, panelBar, segmented, type Segmented } from '../chrome';
import { h, setData, setText } from '../dom';
import { createFramePainter, type ThumbPool } from '../led/thumbs';
import { highlight } from './highlight';

export type QueueState =
  | { readonly kind: 'closed' }
  | { readonly kind: 'connect' }
  | { readonly kind: 'ready' }
  | { readonly kind: 'held' }
  | { readonly kind: 'pending'; readonly text: string };

export interface EditorEvents {
  onProgram(program: Program, source: string): void;
  onRun(): void;
  onQueue(source: string, compiled: boolean): void;
  onShare(source: string): void;
  onCopyCover(): void;
  onBenchRate(hz: number): void;
}

export interface EditorPanel {
  readonly element: HTMLElement;
  readonly source: () => string;
  load(source: string, focus?: boolean): void;
  setQueueState(state: QueueState): void;
  /** One line above the signature: when the program would really run. */
  setTerms(text: string, held: boolean): void;
  monitor(frame: Frame, label: string): void;
}

const BENCH_RATES = [
  { value: '1', text: '1 HZ' },
  { value: '2', text: '2 HZ' },
  { value: '8', text: '8 HZ' },
  { value: '32', text: '32 HZ' },
] as const;

function byteLength(source: string): number {
  return new TextEncoder().encode(source).length;
}

function createMeter(): { readonly element: HTMLElement; set(bytes: number): void } {
  const dots = Array.from({ length: MAX_SOURCE_BYTES }, () => h('i'));
  const count = h('b', { class: 'meter__count' }, `0 / ${MAX_SOURCE_BYTES}`);
  const element = h(
    'div',
    { class: 'meter' },
    h('div', {
      class: 'meter__leds',
      role: 'meter',
      'aria-label': 'Bytes used',
      'aria-valuemin': '0',
      'aria-valuemax': String(MAX_SOURCE_BYTES),
      'aria-valuenow': '0',
    }, ...dots),
    h('div', { class: 'meter__label' }, count, h('span', {}, 'BYTES')),
  );
  let shown = 0;
  const leds = element.firstElementChild as HTMLElement;
  return {
    element,
    set(bytes) {
      const lit = Math.min(bytes, MAX_SOURCE_BYTES);
      for (let i = Math.min(shown, lit); i < Math.max(shown, lit); i++) {
        const dot = dots[i];
        if (dot) dot.dataset['on'] = i < lit ? 'true' : 'false';
      }
      shown = lit;
      setText(count, `${bytes} / ${MAX_SOURCE_BYTES}`);
      setData(element, 'tone', bytes > MAX_SOURCE_BYTES ? 'over' : bytes > MAX_SOURCE_BYTES - 20 ? 'tight' : 'ok');
      leds.setAttribute('aria-valuenow', String(lit));
    },
  };
}

function presetKey(preset: Preset, pool: ThumbPool, onPick: () => void, program: Program): HTMLButtonElement {
  const canvas = h('canvas', { class: 'key__led', 'aria-hidden': 'true' });
  const key = h(
    'button',
    { class: 'key', type: 'button', 'aria-pressed': 'false', title: preset.note, onClick: onPick },
    canvas,
    h('span', { class: 'key__label' }, h('i', { class: 'key__lamp' }), h('span', { class: 'key__name' }, preset.name)),
  );
  pool.add(canvas, program, 2.2);
  return key;
}

export function createEditorPanel(
  presets: readonly Preset[],
  pool: ThumbPool,
  programOf: (source: string) => Program,
  events: EditorEvents,
): EditorPanel {
  const mirror = h('pre', { class: 'code__mirror', 'aria-hidden': 'true' });
  const errorLayer = h('pre', { class: 'code__errors', 'aria-hidden': 'true' });
  const input = h('textarea', {
    class: 'code__input',
    name: 'program',
    rows: 1,
    spellcheck: false,
    autocomplete: 'off',
    autocapitalize: 'off',
    'aria-label': 'One line program. Enter runs it.',
    'aria-describedby': 'editor-status',
    enterKeyHint: 'go',
  });
  input.setAttribute('autocorrect', 'off');

  const errorLine = h('p', { class: 'code__message', hidden: true }, '');
  const statusLamp = h('span', { class: 'lamp', 'data-tone': 'green', 'aria-hidden': 'true' });
  const statusText = h('span', { id: 'editor-status', role: 'status' }, 'COMPILED');
  const meter = createMeter();

  const monitorCanvas = h('canvas', { class: 'monitor__led', role: 'img', 'aria-label': 'Live output of your program' });
  const monitorPainter = createFramePainter(monitorCanvas);
  const monitorLabel = h('span', { class: 'monitor__label' }, 'OUTPUT');

  const runButton = h('button', { class: 'btn', type: 'button', onClick: () => events.onRun() }, 'Run');
  const queueButton = h('button', { class: 'btn btn--gold', type: 'button', disabled: true }, 'Queue opens soon');
  const shareButton = h('button', { class: 'btn', type: 'button', onClick: () => events.onShare(input.value) }, 'Share link');
  const coverButton = h('button', { class: 'btn', type: 'button', onClick: () => events.onCopyCover() }, 'Copy cover');

  const terms = h('p', { class: 'terms' }, '');

  const rate: Segmented<string> = segmented(
    'Bench clock speed',
    BENCH_RATES,
    '2',
    (value) => {
      rate.set(value);
      events.onBenchRate(Number(value));
    },
  );

  let queueState: QueueState = { kind: 'closed' };
  let compiled = true;
  let activeKey: HTMLButtonElement | null = null;
  const keys = new Map<string, HTMLButtonElement>();

  const paintErrors = (source: string, error: CompileError | null): void => {
    errorLayer.textContent = '';
    if (!error) return;
    const start = Math.min(error.index, source.length);
    const end = Math.min(start + Math.max(1, error.length), source.length);
    errorLayer.append(
      document.createTextNode(source.slice(0, start)),
      h('mark', {}, source.slice(start, end) || '\u00a0'),
    );
  };

  const paintQueueButton = (): void => {
    switch (queueState.kind) {
      case 'closed':
        queueButton.textContent = 'Queue opens soon';
        queueButton.disabled = true;
        break;
      case 'connect':
        queueButton.textContent = 'Connect to queue';
        queueButton.disabled = false;
        break;
      case 'ready':
        queueButton.textContent = compiled ? 'Queue 512 cycles' : 'Queue a segfault';
        queueButton.disabled = sourceProblem(input.value) !== null;
        break;
      case 'held':
        queueButton.textContent = 'One at a time';
        queueButton.disabled = true;
        break;
      case 'pending':
        queueButton.textContent = queueState.text;
        queueButton.disabled = true;
        break;
    }
  };

  const refresh = (announce: boolean): void => {
    const source = input.value;
    mirror.replaceChildren(highlight(source), document.createTextNode('\n'));
    meter.set(byteLength(source));

    const result: CompileResult = compile(source);
    compiled = result.ok;
    paintErrors(source, result.ok ? null : result.error);
    if (result.ok) {
      setText(statusText, 'COMPILED');
      setData(statusLamp, 'tone', 'green');
      errorLine.hidden = true;
      if (announce) events.onProgram(result.program, source);
    } else {
      setText(statusText, `SYNTAX ERROR AT BYTE ${result.error.index}`);
      setData(statusLamp, 'tone', 'red');
      setText(errorLine, result.error.message);
      errorLine.hidden = false;
    }
    paintQueueButton();

    const key = keys.get(source) ?? null;
    if (key !== activeKey) {
      activeKey?.setAttribute('aria-pressed', 'false');
      key?.setAttribute('aria-pressed', 'true');
      activeKey = key;
    }
  };

  input.addEventListener('input', () => {
    const cleaned = input.value.replace(/\r?\n/g, ' ');
    if (cleaned !== input.value) input.value = cleaned;
    refresh(true);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    events.onRun();
  });
  queueButton.addEventListener('click', () => events.onQueue(input.value, compiled));

  const bank = h('div', { class: 'bank', role: 'group', 'aria-label': 'Preset programs' });
  for (const preset of presets) {
    const key = presetKey(preset, pool, () => {
      input.value = preset.source;
      refresh(true);
    }, programOf(preset.source));
    keys.set(preset.source, key);
    bank.appendChild(key);
  }

  const { bar } = panelBar(
    'Program',
    'green',
    h('span', { class: 'bar__status' }, statusLamp, statusText),
    h('span', { class: 'bar__spacer' }),
    helpTip(
      'About programs',
      'One expression, evaluated once per cell, per frame. It cannot loop, so it cannot hang. Sign picks the phosphor, size picks the level. The datasheet below has the full reference.',
    ),
  );

  const element = h(
    'section',
    { class: 'panel editor', id: 'program', 'aria-label': 'Program editor' },
    bar,
    h(
      'div',
      { class: 'editor__body' },
      h(
        'div',
        { class: 'monitor' },
        monitorCanvas,
        h('div', { class: 'monitor__foot' }, monitorLabel),
      ),
      h(
        'div',
        { class: 'editor__main' },
        h('div', { class: 'code' }, h('span', { class: 'code__prompt', 'aria-hidden': 'true' }, 'cell ='), h('div', { class: 'code__stack' }, mirror, errorLayer, input), errorLine),
        meter.element,
        h(
          'div',
          { class: 'actions' },
          queueButton,
          runButton,
          shareButton,
          coverButton,
          h('span', { class: 'actions__spacer' }),
          h('span', { class: 'actions__rate' }, h('span', {}, 'BENCH'), rate.element),
        ),
        terms,
      ),
    ),
    bank,
  );

  return {
    element,
    source: () => input.value,
    load(source, focus = false) {
      input.value = source;
      refresh(true);
      if (focus) input.focus();
    },
    setQueueState(state) {
      queueState = state;
      paintQueueButton();
    },
    setTerms(text, held) {
      setText(terms, text);
      setData(terms, 'held', held ? 'true' : 'false');
    },
    monitor(frame, label) {
      monitorPainter.paint(frame);
      setText(monitorLabel, label);
    },
  };
}
