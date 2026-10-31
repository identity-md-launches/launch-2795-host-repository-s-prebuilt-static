import { BLUE_STOPS, GOLD_STOPS, css, ramp } from '../led/palette';
import { DETENTS, TAU, hzOf, type CrankState } from './physics';

const RING_LEDS = 64;
const SPOKES = 3;
const R_LED = 0.962;
const R_TICK_OUT = 0.925;
const R_TICK_IN = 0.905;
const R_RIM_OUT = 0.885;
const R_RIM_IN = 0.715;
const R_HUB = 0.335;
const R_LEGEND = 0.392;
const R_HANDLE = 0.525;
const SPRITE_STEPS = 16;
const TOP = -Math.PI / 2;
/** The handle rests at half past one: clear of the legend, and where a right thumb lands. */
const REST = TOP + TAU / 8;
const FULL_SPEED_HZ = 3.2;

export interface WheelPaint {
  readonly state: CrankState;
  /** 0..1 glow on the handle when the machine is asking to be grabbed. */
  readonly invite: number;
  /** Asleep and untouched: an LED chases the ring to show which way the hand goes. */
  readonly attract: boolean;
  readonly held: boolean;
  /** 0..1 flash on the ring as a cycle completes. */
  readonly flash: number;
  readonly now: number;
}

export interface WheelView {
  fit(cssSize: number): void;
  paint(frame: WheelPaint): void;
}

interface Sprites {
  readonly sheet: HTMLCanvasElement;
  readonly size: number;
}

function blank(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  return [canvas, ctx];
}

function ledSprites(dot: number): Sprites {
  const size = Math.ceil(dot * 6);
  const [sheet, ctx] = blank(size * (SPRITE_STEPS + 1), size);
  for (let s = 1; s <= SPRITE_STEPS; s++) {
    const heat = s / SPRITE_STEPS;
    const color = ramp(GOLD_STOPS, heat);
    const cx = size * s + size / 2;
    const cy = size / 2;
    const halo = ctx.createRadialGradient(cx, cy, dot * 0.7, cx, cy, size / 2);
    halo.addColorStop(0, css(color, 0.55 * heat * heat));
    halo.addColorStop(1, css(color, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(size * s, 0, size, size);
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.arc(cx, cy, dot, 0, TAU);
    ctx.fill();
  }
  return { sheet, size };
}

/** Fixed furniture: detent ticks, the off-state LED wells and the engraved legend. */
function buildFace(pixels: number, radius: number, dpr: number, dot: number): HTMLCanvasElement {
  const [face, ctx] = blank(pixels, pixels);
  ctx.translate(pixels / 2, pixels / 2);

  ctx.fillStyle = '#17171d';
  for (let j = 0; j < RING_LEDS; j++) {
    const phi = (j / RING_LEDS) * TAU + TOP;
    ctx.beginPath();
    ctx.arc(Math.cos(phi) * R_LED * radius, Math.sin(phi) * R_LED * radius, dot, 0, TAU);
    ctx.fill();
  }

  ctx.strokeStyle = '#2f2f39';
  ctx.lineWidth = Math.max(1, dpr * 0.75);
  for (let k = 0; k < DETENTS; k++) {
    const phi = (k / DETENTS) * TAU + TOP;
    ctx.beginPath();
    ctx.moveTo(Math.cos(phi) * R_TICK_IN * radius, Math.sin(phi) * R_TICK_IN * radius);
    ctx.lineTo(Math.cos(phi) * R_TICK_OUT * radius, Math.sin(phi) * R_TICK_OUT * radius);
    ctx.stroke();
  }

  ctx.fillStyle = '#6e6e7a';
  ctx.font = `500 ${Math.round(radius * 0.05)}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const engrave = (text: string, centre: number, flip: boolean): void => {
    const spacing = 0.086;
    [...text].forEach((char, index) => {
      const offset = (index - (text.length - 1) / 2) * spacing;
      const phi = centre + (flip ? -offset : offset);
      ctx.save();
      ctx.rotate(phi);
      ctx.translate(R_LEGEND * radius * (flip ? -1 : 1), 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(char, 0, 0);
      ctx.restore();
    });
  };
  engrave('ONE TURN', TOP, false);
  engrave('ONE CYCLE', TOP, true);
  return face;
}

const lightAt = (angle: number): number => 0.5 - 0.5 * Math.sin(angle);

export function createWheelView(canvas: HTMLCanvasElement): WheelView {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  let radius = 150;
  let dpr = 1;
  let dot = 2;
  let sprites = ledSprites(2);
  let face: HTMLCanvasElement | null = null;

  const ring = (r: number, width: number, color: string): void => {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r * radius, 0, TAU);
    ctx.stroke();
  };

  const drawRungs = (theta: number): void => {
    const depth = (R_RIM_OUT - R_RIM_IN - 0.03) * radius;
    const width = radius * 0.104;
    const mid = ((R_RIM_OUT + R_RIM_IN) / 2) * radius;
    for (let k = 0; k < DETENTS; k++) {
      const angle = theta + (k / DETENTS) * TAU + REST;
      const light = lightAt(angle);
      const stops = k === 0 ? GOLD_STOPS : BLUE_STOPS;
      ctx.save();
      ctx.rotate(angle);
      ctx.translate(mid, 0);
      ctx.fillStyle = css(ramp(stops, 0.46 + 0.42 * light));
      ctx.fillRect(-depth / 2, -width / 2, depth, width);
      // The face nearest the light catches it, wherever the wheel has carried this rung.
      const lit = Math.cos(angle + Math.PI / 2) * radius * 0.016;
      ctx.fillStyle = `rgba(255,255,255,${0.1 + 0.2 * light})`;
      ctx.fillRect(lit > 0 ? depth / 2 - radius * 0.018 : -depth / 2, -width / 2, radius * 0.018, width);
      ctx.restore();
    }
  };

  const drawSpokes = (theta: number): void => {
    const tile = radius * 0.03;
    const pitch = radius * 0.053;
    for (let s = 0; s < SPOKES; s++) {
      const angle = theta + (s / SPOKES) * TAU + REST;
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = css(ramp(BLUE_STOPS, 0.3 + 0.26 * lightAt(angle)));
      for (let d = R_HUB * radius + pitch * 0.72; d < R_RIM_IN * radius - tile; d += pitch) {
        ctx.fillRect(d - tile / 2, -tile / 2, tile, tile);
      }
      ctx.restore();
    }
  };

  const drawTrack = (head: number, direction: number, speed: number, flash: number, chase: number | null): void => {
    const { sheet, size } = sprites;
    const reach = 0.5 + speed * 2.8;
    for (let j = 0; j < RING_LEDS; j++) {
      const phi = (j / RING_LEDS) * TAU + TOP;
      const behind = (((head - phi) * direction) % TAU + TAU) % TAU;
      const comet = Math.exp(-behind / reach) * (0.26 + 0.74 * speed);
      const chased = chase === null ? 0 : Math.exp(-(((chase - phi) % TAU + TAU) % TAU) / 0.5) * 0.62;
      const heat = Math.min(1, Math.max(comet, chased, flash * 0.62));
      const step = Math.round(heat * SPRITE_STEPS);
      if (step === 0) continue;
      const x = Math.cos(phi) * R_LED * radius;
      const y = Math.sin(phi) * R_LED * radius;
      ctx.drawImage(sheet, size * step, 0, size, size, x - size / 2, y - size / 2, size, size);
    }
  };

  /** A rust-backed knob of dots, graded cream to orange from above like the lettering. */
  const drawHandle = (theta: number, invite: number, held: boolean): void => {
    const angle = theta + REST;
    const x = Math.cos(angle) * R_HANDLE * radius;
    const y = Math.sin(angle) * R_HANDLE * radius;
    const pitch = radius * 0.0345;
    const lift = held ? 0.25 : invite * 0.16;
    const span = pitch * (3.9 + (held ? 1.6 : invite * 1.1));

    const halo = ctx.createRadialGradient(x, y, pitch * 2.4, x, y, span * 1.5);
    halo.addColorStop(0, css(ramp(GOLD_STOPS, 0.75), 0.3 + lift));
    halo.addColorStop(1, css(ramp(GOLD_STOPS, 0.75), 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, span * 1.5, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#070709';
    ctx.beginPath();
    ctx.arc(x, y, pitch * 3.7, 0, TAU);
    ctx.fill();

    const cells = (offsetX: number, offsetY: number, tone: (row: number) => number): void => {
      for (let row = -3; row <= 3; row++) {
        for (let col = -3; col <= 3; col++) {
          if (Math.hypot(col, row) > 3.25) continue;
          ctx.fillStyle = css(ramp(GOLD_STOPS, tone(row)));
          ctx.beginPath();
          ctx.arc(x + (col + offsetX) * pitch, y + (row + offsetY) * pitch, pitch * 0.45, 0, TAU);
          ctx.fill();
        }
      }
    };
    cells(0.55, 0.55, () => 0.25);
    cells(0, 0, (row) => Math.min(1, (row <= -2 ? 1 : row <= 1 ? 0.75 : 0.5) + lift));
  };

  /** Rides up over each rung and drops into the notch behind it. */
  const drawPawl = (theta: number, flash: number): void => {
    const phase = (((theta * DETENTS) / TAU) % 1 + 1) % 1;
    const ride = Math.sin(phase * Math.PI);
    const y = -(R_TICK_OUT + 0.012 + ride * 0.022) * radius;
    const half = radius * 0.03;
    ctx.fillStyle = css(ramp(GOLD_STOPS, 0.72 + 0.28 * Math.max(ride, flash)));
    ctx.beginPath();
    ctx.moveTo(-half, y - half * 0.5);
    ctx.lineTo(half, y - half * 0.5);
    ctx.lineTo(0, y + half * 1.1);
    ctx.closePath();
    ctx.fill();
  };

  return {
    fit(cssSize) {
      dpr = Math.min(window.devicePixelRatio || 1, 3);
      const pixels = Math.round(cssSize * dpr);
      canvas.width = pixels;
      canvas.height = pixels;
      canvas.style.width = `${cssSize}px`;
      canvas.style.height = `${cssSize}px`;
      radius = pixels / 2 - 1;
      dot = Math.max(1.4, radius * 0.0165);
      sprites = ledSprites(dot);
      face = buildFace(pixels, radius, dpr, dot);
    },
    paint({ state, invite, attract, held, flash, now }) {
      const speed = Math.min(1, hzOf(state) / FULL_SPEED_HZ);
      const direction = state.omega < 0 ? -1 : 1;

      // Keep some of the last frame so fast rungs smear into light, like the wall's phosphor.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0,0,0,${1 - speed * 0.74})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      if (face) ctx.drawImage(face, 0, 0);
      ctx.translate(canvas.width / 2, canvas.height / 2);

      const hair = Math.max(1, dpr * 0.75);
      ring(R_RIM_OUT, hair * 1.6, '#3a3a46');
      ring(R_RIM_IN, hair * 1.6, '#3a3a46');
      drawRungs(state.theta);
      drawSpokes(state.theta);

      ctx.fillStyle = '#0b0b0d';
      ctx.beginPath();
      ctx.arc(0, 0, R_HUB * radius, 0, TAU);
      ctx.fill();
      ring(R_HUB, hair, '#26262f');

      const chase = attract ? ((now / 1250) % 1) * TAU + TOP : null;
      drawTrack(state.theta + REST, direction, speed, flash, chase);
      drawPawl(state.theta, flash);
      drawHandle(state.theta, invite, held);
    },
  };
}
