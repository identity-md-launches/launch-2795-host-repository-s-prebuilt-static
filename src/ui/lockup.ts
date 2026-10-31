import { BLUE_STOPS, GOLD_STOPS, css, type Rgb } from './led/palette';
import { WORDMARK_GLYPHS, WORDMARK_TURING, WORDMARK_WHEEL } from './led/font';
import { h, svg } from './dom';

const LETTER_GAP = 2;
const GLYPH_ROWS = 9;
const COLUMNS = 44;
const ROWS_TOTAL = GLYPH_ROWS * 2 + 3;

interface Cell {
  readonly x: number;
  readonly y: number;
  readonly level: number;
}

function layoutWord(letters: readonly string[], top: number): readonly Cell[] {
  let cursor = 0;
  const cells: Cell[] = [];
  for (const letter of letters) {
    const rows = WORDMARK_GLYPHS[letter] ?? [];
    rows.forEach((row, y) => {
      [...row].forEach((mark, x) => {
        if (mark !== '#') return;
        const level = y < 2 ? 4 : y < 7 ? 3 : 2;
        cells.push({ x: cursor + x, y: top + y, level });
      });
    });
    cursor += (rows[0]?.length ?? 0) + LETTER_GAP;
  }
  return cells;
}

/** Everything lit casts a one-cell shadow down and right, one level short of off. */
function withExtrude(cells: readonly Cell[]): readonly Cell[] {
  const key = (x: number, y: number): number => y * 1000 + x;
  const lit = new Set(cells.map((cell) => key(cell.x, cell.y)));
  const shadow = cells
    .map((cell) => ({ x: cell.x + 1, y: cell.y + 1, level: 1 }))
    .filter((cell) => !lit.has(key(cell.x, cell.y)));
  const unique = new Map(shadow.map((cell) => [key(cell.x, cell.y), cell]));
  return [...unique.values(), ...cells];
}

function paintLockup(canvas: HTMLCanvasElement, cssWidth: number): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const pitch = Math.max(2, Math.floor((cssWidth * dpr) / COLUMNS));
  const pad = pitch * 2;
  canvas.width = pitch * COLUMNS + pad * 2;
  canvas.height = pitch * ROWS_TOTAL + pad * 2;
  canvas.style.width = `${canvas.width / dpr}px`;
  canvas.style.height = `${canvas.height / dpr}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const gold = withExtrude(layoutWord(WORDMARK_TURING, 0));
  const blue = withExtrude(layoutWord(WORDMARK_WHEEL, GLYPH_ROWS + 2));

  for (const cell of gold) {
    const color = GOLD_STOPS[cell.level - 1] as Rgb;
    const x = pad + (cell.x + 0.5) * pitch;
    const y = pad + (cell.y + 0.5) * pitch;
    const halo = ctx.createRadialGradient(x, y, pitch * 0.3, x, y, pitch * 1.05);
    halo.addColorStop(0, css(color, cell.level === 1 ? 0.16 : 0.34));
    halo.addColorStop(1, css(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(x - pitch * 1.1, y - pitch * 1.1, pitch * 2.2, pitch * 2.2);
  }
  for (const cell of gold) {
    ctx.fillStyle = css(GOLD_STOPS[cell.level - 1] as Rgb);
    ctx.beginPath();
    ctx.arc(pad + (cell.x + 0.5) * pitch, pad + (cell.y + 0.5) * pitch, pitch * 0.44, 0, Math.PI * 2);
    ctx.fill();
  }
  const inset = Math.max(0.5, pitch * 0.05);
  for (const cell of blue) {
    ctx.fillStyle = css(BLUE_STOPS[cell.level - 1] as Rgb);
    ctx.fillRect(
      pad + cell.x * pitch + inset,
      pad + cell.y * pitch + inset,
      pitch - inset * 2,
      pitch - inset * 2,
    );
  }
}

export function createLockup(): { readonly element: HTMLCanvasElement; fit(width: number): void } {
  const element = h('canvas', {
    class: 'lockup',
    role: 'img',
    'aria-label': 'Turing Wheel',
  });
  let last = 0;
  return {
    element,
    fit(width) {
      if (width === last || width <= 0) return;
      last = width;
      paintLockup(element, width);
    },
  };
}

export interface WheelMark {
  readonly element: SVGSVGElement;
  /** Wired straight to the cycle count: one turn is one wheel pass. */
  setTurn(turns: number): void;
}

export function createWheelMark(): WheelMark {
  const dots = Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2;
    return svg('circle', {
      cx: (16 + Math.cos(angle) * 13.4).toFixed(2),
      cy: (16 + Math.sin(angle) * 13.4).toFixed(2),
      r: 1.72,
      fill: index === 13 ? '#ffe28a' : '#ffc048',
    });
  });
  const spokes = [0, 1, 2].flatMap((spoke) => {
    const angle = (spoke / 3) * Math.PI * 2 - Math.PI / 2;
    return [5, 8, 10.4].map((distance) =>
      svg('rect', {
        x: (16 + Math.cos(angle) * distance - 1.2).toFixed(2),
        y: (16 + Math.sin(angle) * distance - 1.2).toFixed(2),
        width: 2.4,
        height: 2.4,
        fill: '#5b7cfa',
      }),
    );
  });
  const hub = svg('rect', { x: 13.6, y: 13.6, width: 4.8, height: 4.8, fill: '#a8baff' });
  const rotor = svg('g', {}, ...dots, ...spokes);
  const element = svg('svg', {
    class: 'wheel-mark',
    viewBox: '0 0 32 32',
    width: 32,
    height: 32,
    'aria-hidden': 'true',
  }, rotor, hub);

  return {
    element,
    setTurn(turns) {
      rotor.setAttribute('transform', `rotate(${((turns % 1) * 360).toFixed(2)} 16 16)`);
    },
  };
}
