import { CELLS, COLS } from '../../types';
import { BLUE_STOPS, FACE_RGB, GOLD_STOPS, WELL_RGB, css, ramp } from './palette';
import type { LedSurface, SurfaceOptions } from './surface';

const STEPS = 20;

interface Sprites {
  readonly gold: HTMLCanvasElement;
  readonly blue: HTMLCanvasElement;
  readonly lattice: HTMLCanvasElement;
  readonly size: number;
  readonly pad: number;
}

function sheet(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [canvas, ctx];
}

function buildSprites(pitch: number, width: number, height: number, transparent: boolean): Sprites {
  const pad = Math.ceil(pitch * 0.5);
  const size = pitch + pad * 2;
  const [gold, goldCtx] = sheet(size * (STEPS + 1), size);
  const [blue, blueCtx] = sheet(size * (STEPS + 1), size);

  for (let s = 1; s <= STEPS; s++) {
    const heat = s / STEPS;
    const cx = size * s + size / 2;
    const cy = size / 2;
    const color = ramp(GOLD_STOPS, heat);
    const halo = goldCtx.createRadialGradient(cx, cy, pitch * 0.3, cx, cy, pitch * 0.98);
    halo.addColorStop(0, css(color, 0.42 * heat * heat));
    halo.addColorStop(1, css(color, 0));
    goldCtx.fillStyle = halo;
    goldCtx.fillRect(size * s, 0, size, size);
    goldCtx.fillStyle = css(color);
    goldCtx.beginPath();
    goldCtx.arc(cx, cy, pitch * 0.435, 0, Math.PI * 2);
    goldCtx.fill();

    const tile = ramp(BLUE_STOPS, heat);
    const inset = Math.max(1, Math.round(pitch * 0.05));
    const x = size * s + pad + inset;
    const y = pad + inset;
    const side = pitch - inset * 2;
    blueCtx.fillStyle = css(tile);
    blueCtx.fillRect(x, y, side, side);
    blueCtx.fillStyle = 'rgba(255,255,255,0.14)';
    blueCtx.fillRect(x, y, side, Math.max(1, pitch * 0.07));
    blueCtx.fillStyle = 'rgba(0,0,0,0.32)';
    blueCtx.fillRect(x, y + side - Math.max(1, pitch * 0.07), side, Math.max(1, pitch * 0.07));
  }

  const [lattice, ctx] = sheet(width, height);
  if (!transparent) {
    ctx.fillStyle = css(FACE_RGB);
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = css(WELL_RGB);
    for (let i = 0; i < CELLS; i++) {
      ctx.beginPath();
      ctx.arc(((i % COLS) + 0.5) * pitch, (Math.floor(i / COLS) + 0.5) * pitch, pitch * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return { gold, blue, lattice, size, pad };
}

export function createCanvasSurface(canvas: HTMLCanvasElement, options: SurfaceOptions): LedSurface | null {
  const ctx = canvas.getContext('2d', { alpha: options.transparent });
  if (!ctx) return null;
  let sprites: Sprites | null = null;
  let pitch = 8;

  return {
    kind: 'canvas2d',
    resize(width, height, nextPitch) {
      canvas.width = width;
      canvas.height = height;
      pitch = nextPitch;
      sprites = buildSprites(pitch, width, height, options.transparent);
    },
    draw(heat, power) {
      if (!sprites) return;
      const { gold, blue, lattice, size, pad } = sprites;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(lattice, 0, 0);
      for (let i = 0; i < CELLS; i++) {
        const x = (i % COLS) * pitch - pad;
        const y = Math.floor(i / COLS) * pitch - pad;
        const b = Math.round((heat[i * 2 + 1] as number) * STEPS);
        if (b > 0) ctx.drawImage(blue, size * b, 0, size, size, x, y, size, size);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < CELLS; i++) {
        const x = (i % COLS) * pitch - pad;
        const y = Math.floor(i / COLS) * pitch - pad;
        const g = Math.round((heat[i * 2] as number) * STEPS);
        if (g > 0) ctx.drawImage(gold, size * g, 0, size, size, x, y, size, size);
      }
      ctx.globalCompositeOperation = 'source-over';
      if (power < 0.995) {
        ctx.fillStyle = `rgba(0,0,0,${1 - power})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    },
    destroy() {
      sprites = null;
    },
  };
}
