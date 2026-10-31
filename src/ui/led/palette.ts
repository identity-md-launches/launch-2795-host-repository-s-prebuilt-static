export type Rgb = readonly [number, number, number];

function hex(value: string): Rgb {
  const n = parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Sampled from the wordmark rows: extrude, low, mid, top. Level n sits at heat n/4. */
export const GOLD_STOPS: readonly Rgb[] = ['#8c3a10', '#f08a28', '#ffc048', '#ffe28a'].map(hex);
export const BLUE_STOPS: readonly Rgb[] = ['#1e2c78', '#3f5fe0', '#5b7cfa', '#a8baff'].map(hex);

export const WELL_RGB: Rgb = hex('#17171d');
export const FACE_RGB: Rgb = hex('#070709');

/** Heat 0..1 walks the stops the way a filament cools: cream, gold, orange, rust, off. */
export function ramp(stops: readonly Rgb[], heat: number): Rgb {
  const x = Math.min(1, Math.max(0, heat)) * 4;
  if (x <= 1) {
    const top = stops[0] as Rgb;
    return [top[0] * x, top[1] * x, top[2] * x];
  }
  const index = Math.min(3, Math.floor(x)) - 1;
  const from = stops[index] as Rgb;
  const to = stops[index + 1] as Rgb;
  const k = x - 1 - index;
  return [
    from[0] + (to[0] - from[0]) * k,
    from[1] + (to[1] - from[1]) * k,
    from[2] + (to[2] - from[2]) * k,
  ];
}

export function css([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
}
