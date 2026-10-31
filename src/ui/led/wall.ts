import { COLS, ROWS } from '../../types';
import { createCanvasSurface } from './canvas2d';
import { createGlSurface } from './gl';
import { createPhosphor } from './phosphor';
import type { LedSurface } from './surface';

export interface LedWallOptions {
  readonly transparent?: boolean;
  /** Forces the Canvas2D path. Exposed for QA through ?renderer=2d. */
  readonly forceCanvas2d?: boolean;
}

export interface LedWall {
  readonly kind: LedSurface['kind'];
  /** Fits the lattice inside the given CSS box and returns the size it took. */
  fit(cssWidth: number, cssHeight: number): { readonly width: number; readonly height: number };
  present(targets: Float32Array, dtMs: number, power: number): void;
  settle(targets: Float32Array): void;
  destroy(): void;
}

function pickSurface(canvas: HTMLCanvasElement, options: LedWallOptions, onLost: () => void): LedSurface {
  const transparent = options.transparent ?? false;
  if (!options.forceCanvas2d) {
    const gl = createGlSurface(canvas, { transparent, onLost });
    if (gl) return gl;
  }
  const flat = createCanvasSurface(canvas, { transparent });
  if (flat) return flat;
  throw new Error('No canvas context available');
}

export function createLedWall(host: HTMLCanvasElement, options: LedWallOptions = {}): LedWall {
  let canvas = host;
  const phosphor = createPhosphor();
  let lastSize = { pitch: 0, width: 0, height: 0 };

  const fallBack = (): void => {
    // A canvas that held a WebGL context can never return a 2D one, so swap the element.
    const next = document.createElement('canvas');
    next.className = canvas.className;
    next.setAttribute('role', canvas.getAttribute('role') ?? 'img');
    next.setAttribute('aria-label', canvas.getAttribute('aria-label') ?? '');
    next.style.cssText = canvas.style.cssText;
    canvas.replaceWith(next);
    canvas = next;
    const flat = createCanvasSurface(next, { transparent: options.transparent ?? false });
    if (flat) {
      surface = flat;
      surface.resize(lastSize.width, lastSize.height, lastSize.pitch);
    }
  };

  let surface = pickSurface(canvas, options, fallBack);

  return {
    get kind() {
      return surface.kind;
    },
    fit(cssWidth, cssHeight) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const pitch = Math.max(2, Math.floor(Math.min((cssWidth * dpr) / COLS, (cssHeight * dpr) / ROWS)));
      const width = pitch * COLS;
      const height = pitch * ROWS;
      if (pitch !== lastSize.pitch) {
        lastSize = { pitch, width, height };
        surface.resize(width, height, pitch);
      }
      const size = { width: width / dpr, height: height / dpr };
      canvas.style.width = `${size.width}px`;
      canvas.style.height = `${size.height}px`;
      return size;
    },
    present(targets, dtMs, power) {
      phosphor.step(targets, dtMs);
      surface.draw(phosphor.heat, power);
    },
    settle(targets) {
      phosphor.settle(targets);
    },
    destroy() {
      surface.destroy();
    },
  };
}
