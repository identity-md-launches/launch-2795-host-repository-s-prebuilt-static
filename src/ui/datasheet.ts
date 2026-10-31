import { MAX_SOURCE_BYTES, SLICE_PASSES } from '../types';
import { panelBar } from './chrome';
import { h, svg } from './dom';

const FEATURES: readonly (readonly [string, string])[] = [
  ['CPU', '1 hamster'],
  ['Clock', 'Variable'],
  ['Cycle', '1 wheel pass, about 0.88 m'],
  ['Instruction set', '1 expression'],
  ['Program memory', `${MAX_SOURCE_BYTES} bytes`],
  ['Display', '64 x 36, two phosphors'],
  ['Cooling', 'Passive. He naps.'],
  ['Moore\'s law', 'Does not apply'],
];

const RATINGS: readonly (readonly [string, string, string])[] = [
  ['Source length', `${MAX_SOURCE_BYTES}`, 'bytes, printable ASCII'],
  ['Slice', `${SLICE_PASSES}`, 'cycles per program'],
  ['Programs per author', '1', 'unfinished at a time'],
  ['Squeeks per wallet', '1', 'per program'],
  ['Halt duration', 'No limit', 'he is not on call'],
];

const PINS: readonly (readonly [string, string])[] = [
  ['t', 'Cycles since start. Fractional.'],
  ['x', 'Column, 0 to 63'],
  ['y', 'Row, 0 to 35'],
  ['i', 'Cell index, y*64+x'],
  ['u', 'x from centre'],
  ['v', 'y from centre'],
  ['r', 'Distance from centre'],
  ['a', 'Angle from centre'],
];

const FUNCTION_GROUPS: readonly (readonly [string, string])[] = [
  ['Trig', 'sin cos tan atan2 hypot'],
  ['Rounding', 'floor ceil round fract'],
  ['Shaping', 'abs sign sqrt min max clamp mix step mod'],
  ['Entropy', 'hash noise. Deterministic, sorry.'],
];

const OPERATORS: readonly (readonly [string, string])[] = [
  ['Arithmetic', '+ - * / % **'],
  ['Compare', '== != < > <= >= give 1 or 0'],
  ['Logic', '&& || ! ?:'],
  ['Bitwise', '& | ^ ~ << >> on int32'],
];

function table(rows: readonly (readonly string[])[], columns: number): HTMLElement {
  return h(
    'dl',
    { class: `spec spec--${columns}` },
    ...rows.flatMap((row) => {
      const [term, ...rest] = row;
      return [
        h('dt', {}, term ?? ''),
        h('dd', {}, ...rest.map((value, index) => h('span', { class: index === 0 ? 'spec__main' : 'spec__note' }, value))),
      ];
    }),
  );
}

/** Eight pins in, one display out, drawn as the top view of a DIP package. */
function pinout(onPin: (pin: string) => void): HTMLElement {
  const pinRows = PINS.map(([pin, note], index) =>
    h(
      'button',
      {
        class: 'pin',
        type: 'button',
        title: `Insert ${pin}`,
        'aria-label': `Pin ${index + 1}, ${pin}: ${note}. Insert into the program.`,
        onClick: () => onPin(pin),
      },
      h('span', { class: 'pin__no' }, String(index + 1).padStart(2, '0')),
      h('i', { class: 'pin__leg', 'aria-hidden': 'true' }),
      h('code', { class: 'pin__name' }, pin),
      h('span', { class: 'pin__note' }, note),
    ),
  );
  const notch = svg('svg', { class: 'dip__notch', viewBox: '0 0 40 12', 'aria-hidden': 'true' },
    svg('path', { d: 'M4 0a16 11 0 0 0 32 0', fill: 'none', stroke: '#3a3a46' }));
  return h(
    'div',
    { class: 'dip' },
    notch,
    h('div', { class: 'dip__part' }, h('b', {}, 'TW-1'), h('span', {}, 'REV A')),
    h('div', { class: 'dip__pins' }, ...pinRows),
  );
}

export function createDatasheet(onPin: (pin: string) => void): HTMLElement {
  const { bar } = panelBar(
    'Datasheet',
    'green',
    h('span', { class: 'bar__sub' }, 'TW-1 SINGLE-RODENT MICROPROCESSOR'),
  );

  return h(
    'section',
    { class: 'panel sheet', id: 'datasheet', 'aria-label': 'Datasheet' },
    bar,
    h(
      'div',
      { class: 'sheet__grid' },
      h(
        'div',
        { class: 'sheet__col' },
        h('h3', { class: 'sheet__head' }, 'Features'),
        table(FEATURES, 2),
        h('h3', { class: 'sheet__head' }, 'Absolute maximum ratings'),
        table(RATINGS, 3),
        h('p', { class: 'sheet__fine' }, 'Stresses beyond these ratings revert on-chain. Functional operation while asleep is not implied.'),
      ),
      h(
        'div',
        { class: 'sheet__col' },
        h('h3', { class: 'sheet__head' }, 'Pinout, top view'),
        pinout(onPin),
        h('p', { class: 'sheet__fine' }, 'Tap a pin to wire it into your program.'),
      ),
      h(
        'div',
        { class: 'sheet__col' },
        h('h3', { class: 'sheet__head' }, 'Output'),
        h(
          'ul',
          { class: 'phosphors' },
          h('li', {}, h('i', { class: 'swatch swatch--gold' }), h('span', {}, h('b', {}, 'Positive'), ' lights a gold round LED.')),
          h('li', {}, h('i', { class: 'swatch swatch--blue' }), h('span', {}, h('b', {}, 'Negative'), ' lights a blue square tile.')),
          h('li', {}, h('i', { class: 'swatch swatch--off' }), h('span', {}, h('b', {}, 'Size'), ' clamps to 1 and rounds to 4 levels. NaN is dark.')),
        ),
        h('h3', { class: 'sheet__head' }, 'Operators'),
        table(OPERATORS, 2),
        h('h3', { class: 'sheet__head' }, 'Functions'),
        table(FUNCTION_GROUPS, 2),
        h('p', { class: 'sheet__fine' }, 'A program that fails to compile is still valid on-chain. It simply owns 512 cycles of SEGFAULT, in public.'),
      ),
    ),
  );
}
