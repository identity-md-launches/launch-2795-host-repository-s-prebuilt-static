export type CoreStatus = 'IDLE' | 'ACTIVE' | 'COUNTER_FAULT';

export interface Telemetry {
  readonly work: number;
  readonly hz: number;
  readonly rpm: number;
  readonly core: CoreStatus;
  readonly fresh: boolean;
  readonly epoch: string;
  readonly observedAt: number;
  readonly staleAfterMs: number;
  /** Server time this body was built, when the API sent one. */
  readonly generatedAt: number | null;
}

const DEFAULT_STALE_AFTER_SECONDS = 120;
const MAX_RETRY_AFTER_MS = 10 * 60_000;
const CORE_STATUSES: readonly string[] = ['IDLE', 'ACTIVE', 'COUNTER_FAULT'];

function toCount(value: unknown): number | null {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toTime(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Null means the body holds nothing we may treat as real hamster telemetry. */
export function parseStatus(body: unknown): Telemetry | null {
  if (!isRecord(body) || !isRecord(body['measurement'])) return null;
  const measurement = body['measurement'];
  const work = toCount(measurement['cumulativeWorkUnits']);
  const rpmMilli = toCount(measurement['rpmMilli']);
  const observedAt = toTime(measurement['observedAt']);
  const core = measurement['coreStatus'];
  if (work === null || rpmMilli === null || observedAt === null) return null;
  if (typeof core !== 'string' || !CORE_STATUSES.includes(core)) return null;
  if (measurement['provenance'] !== 'hardware') return null;
  return {
    work,
    hz: rpmMilli / 60_000,
    rpm: rpmMilli / 1_000,
    core: core as CoreStatus,
    fresh: measurement['freshness'] === 'online',
    epoch: String(measurement['counterEpoch']),
    observedAt,
    staleAfterMs: (toCount(measurement['staleAfterSeconds']) ?? DEFAULT_STALE_AFTER_SECONDS) * 1_000,
    generatedAt: toTime(body['generatedAt']),
  };
}

export function parseRetryAfter(value: string | null, now: number): number {
  if (value === null) return 0;
  const seconds = Number(value);
  const delay = Number.isNaN(seconds) ? (toTime(value) ?? now) - now : seconds * 1_000;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, delay));
}
