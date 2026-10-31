export interface SurfaceOptions {
  readonly transparent: boolean;
  readonly onLost?: () => void;
}

export interface LedSurface {
  readonly kind: 'webgl2' | 'canvas2d';
  /** Sizes are device pixels and always whole multiples of pitch, so the lattice never shimmers. */
  resize(width: number, height: number, pitch: number): void;
  /** heat is interleaved gold, blue per cell. power is a master gain, 1 is nominal. */
  draw(heat: Float32Array, power: number): void;
  destroy(): void;
}
