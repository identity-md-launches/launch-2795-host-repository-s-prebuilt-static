// Shared contract between lang, machine, chain and ui. Change only by agreement.

/** Display geometry. Matches Squeekchain's LED headline format, so any frame is a valid cover. */
export const COLS = 64;
export const ROWS = 36;
export const CELLS = COLS * ROWS;

/** Wheel passes each queued program owns. Mirrors TuringWheel.SLICE. */
export const SLICE_PASSES = 512;
/** Mirrors TuringWheel.MAX_SOURCE_BYTES. */
export const MAX_SOURCE_BYTES = 140;

/**
 * One frame, row-major, length CELLS. Signed levels -4..4:
 * positive is a gold round LED, negative a blue square tile, 0 is off.
 */
export type Frame = Int8Array;

export function createFrame(): Frame {
  return new Int8Array(CELLS);
}

export interface CompileError {
  readonly message: string;
  /** Character offset into the source. */
  readonly index: number;
  readonly length: number;
}

export interface Program {
  readonly source: string;
  /** Fills `out` for time t, in wheel passes. t may be fractional. Never throws. */
  render(t: number, out: Frame): void;
}

export type CompileResult =
  | { readonly ok: true; readonly program: Program }
  | { readonly ok: false; readonly error: CompileError };

export type HamsterState = 'running' | 'asleep' | 'fault' | 'signal-lost';

export interface HamsterReading {
  /** Cumulative wheel passes. Monotonic, fractional between polls while he runs. */
  readonly work: number;
  /** Wheel passes per second right now. */
  readonly hz: number;
  readonly rpm: number;
  readonly state: HamsterState;
  /** Epoch ms of the last telemetry accepted from the API. */
  readonly observedAt: number;
  /** Epoch ms of his next published run, when the API or site publishes one. */
  readonly nextLiveAt: number | null;
}

export interface HamsterClock {
  /** Interpolated reading for this instant. Cheap: safe to call every animation frame. */
  read(now: number): HamsterReading;
  subscribe(listener: (reading: HamsterReading) => void): () => void;
  stop(): void;
}

export type Address = `0x${string}`;
export type Hash = `0x${string}`;

export interface QueuedProgram {
  readonly id: number;
  readonly author: Address;
  readonly source: string;
  readonly startWork: number;
  readonly endWork: number;
  readonly squeeks: number;
}

/** What the machine should be running at a given work count. */
export type Slot =
  | { readonly kind: 'queued'; readonly program: QueuedProgram; readonly t: number; readonly remaining: number }
  | { readonly kind: 'house'; readonly index: number; readonly source: string; readonly name: string; readonly t: number; readonly remaining: number };

export interface Preset {
  readonly name: string;
  readonly source: string;
  readonly note: string;
}

export interface QueueReader {
  /** Latest known programs, oldest first. Empty until the first read lands. */
  list(): readonly QueuedProgram[];
  refresh(): Promise<void>;
  subscribe(listener: (programs: readonly QueuedProgram[]) => void): () => void;
  stop(): void;
}

export interface WalletOption {
  readonly id: string;
  readonly name: string;
  readonly icon: string | null;
}

export interface WalletSession {
  readonly address: Address;
  /** Sends TuringWheel.submit and resolves once mined, with the new program id. */
  submit(source: string): Promise<{ readonly hash: Hash; readonly programId: number }>;
  squeek(programId: number): Promise<Hash>;
  disconnect(): void;
}
