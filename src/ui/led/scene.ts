import { CELLS, COLS, ROWS, type Frame } from '../../types';
import { FONT_BANNER, FONT_MINI, FONT_PLAQUE, eachTextCell, textWidth, type LedFont } from './font';

/** A layer of lettering. ink is signed heat, mask marks cells the held frame may not show through. */
export interface Plate {
  readonly ink: Float32Array;
  readonly mask: Uint8Array;
}

export type PlateTone = 'gold' | 'cream' | 'blue' | 'pale' | 'rust' | 'ember' | 'navy';

const TONE_HEAT: Record<PlateTone, number> = {
  cream: 1,
  gold: 0.75,
  ember: 0.42,
  rust: 0.28,
  pale: -1,
  blue: -0.75,
  navy: -0.25,
};

export interface PlateLine {
  readonly text: string;
  readonly font: 'mini' | 'banner' | 'plaque';
  readonly tone: PlateTone;
  readonly x: number;
  readonly y: number;
  /** A solid plaque of this tone behind the lettering, like a lit signboard. */
  readonly block?: { readonly tone: PlateTone; readonly width: number; readonly height: number };
}

const FONTS: Record<PlateLine['font'], LedFont> = { mini: FONT_MINI, banner: FONT_BANNER, plaque: FONT_PLAQUE };

function put(plate: Plate, x: number, y: number, heat: number, opaque: boolean): void {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return;
  const index = y * COLS + x;
  plate.ink[index] = heat;
  if (opaque) plate.mask[index] = 1;
}

function keepOut(plate: Plate, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS) plate.mask[cy * COLS + cx] = 1;
    }
  }
}

export function buildPlate(lines: readonly PlateLine[]): Plate {
  const plate: Plate = { ink: new Float32Array(CELLS), mask: new Uint8Array(CELLS) };
  for (const line of lines) {
    const font = FONTS[line.font];
    const heat = TONE_HEAT[line.tone];
    if (line.block) {
      const fill = TONE_HEAT[line.block.tone];
      for (let y = 0; y < line.block.height; y++) {
        for (let x = 0; x < line.block.width; x++) {
          put(plate, line.x + x, line.y + y, fill, true);
        }
      }
      const pad = Math.floor((line.block.width - textWidth(font, line.text)) / 2);
      const top = Math.floor((line.block.height - font.height) / 2);
      eachTextCell(font, line.text, line.x + pad, line.y + top, (x, y) => put(plate, x, y, heat, true));
      continue;
    }
    eachTextCell(font, line.text, line.x, line.y, (x, y) => {
      keepOut(plate, x, y);
      put(plate, x, y, heat, true);
    });
  }
  return plate;
}

export function centred(font: PlateLine['font'], text: string): number {
  return Math.floor((COLS - textWidth(FONTS[font], text)) / 2);
}

/** Writes the program frame into targets, scaled, with no plate over it. */
export function frameToTargets(frame: Frame, gain: number, out: Float32Array): void {
  for (let i = 0; i < CELLS; i++) out[i] = ((frame[i] as number) / 4) * gain;
}

/** Lays a plate over the targets. reveal 0..1 wipes it on from the left edge. */
export function stampPlate(plate: Plate, reveal: number, out: Float32Array): void {
  const edge = reveal * COLS;
  for (let i = 0; i < CELLS; i++) {
    if (!plate.mask[i]) continue;
    if (i % COLS > edge) continue;
    out[i] = plate.ink[i] as number;
  }
}

/**
 * Power-on wave: cells ahead of the front stay at the held brightness, the front
 * itself runs hot, and everything behind it is at full level.
 */
export function applyWakeWave(frame: Frame, progress: number, heldGain: number, out: Float32Array): void {
  const reach = progress * 86 - 12;
  for (let i = 0; i < CELLS; i++) {
    const x = i % COLS;
    const y = Math.floor(i / COLS);
    const distance = Math.hypot(x - (COLS - 1) / 2, y - (ROWS - 1) / 2);
    const level = (frame[i] as number) / 4;
    const passed = Math.min(1, Math.max(0, (reach - distance) / 4 + 0.5));
    const gain = heldGain + (1 - heldGain) * passed;
    const front = Math.exp(-(((distance - reach) / 3) ** 2));
    const boosted = level * gain;
    const hot = Math.max(Math.abs(boosted), front * 0.8);
    out[i] = level < 0 ? -hot : hot;
  }
}

/** Dead air for lost telemetry: dim blue speckle that reseeds slowly. Never reads as data. */
export function applyStatic(frameIndex: number, out: Float32Array): void {
  for (let i = 0; i < CELLS; i++) {
    let h = Math.imul(i * 2654435761 + frameIndex * 40503, 2246822519) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 3266489917) >>> 0;
    h ^= h >>> 16;
    const n = (h & 1023) / 1023;
    out[i] = n > 0.9 ? -0.18 - (n - 0.9) * 1.2 : 0;
  }
}

/** A stopped wheel in the corner of the halted plate, rocking as if he just stepped off. */
export function drawIdleWheel(cx: number, cy: number, radius: number, angle: number, out: Float32Array): void {
  for (let y = Math.floor(cy - radius - 1); y <= cy + radius + 1; y++) {
    for (let x = Math.floor(cx - radius - 1); x <= cx + radius + 1; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const u = x - cx;
      const v = y - cy;
      const r = Math.hypot(u, v);
      const index = y * COLS + x;
      if (Math.abs(r - radius) < 0.62) {
        out[index] = 0.62;
        continue;
      }
      if (r < radius - 0.6) {
        const cross = Math.abs(Math.sin(Math.atan2(v, u) * 1.5 - angle * 1.5)) * r;
        out[index] = cross < 0.55 ? 0.34 : 0;
      }
    }
  }
}
