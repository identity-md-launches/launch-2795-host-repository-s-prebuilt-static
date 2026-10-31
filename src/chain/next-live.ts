import { LIVE_SCHEDULE_URL } from './config';

export interface NextLiveOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly url?: string | null;
}

const REQUEST_TIMEOUT_MS = 8_000;

function parseStart(body: unknown): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const { schemaVersion, occurrence } = body as { schemaVersion?: unknown; occurrence?: unknown };
  if (schemaVersion !== 1 || typeof occurrence !== 'object' || occurrence === null) return null;
  const { earlyStartAt, startAt, endAt } = occurrence as Record<string, unknown>;
  const start = Date.parse(String(startAt));
  const end = Date.parse(String(endAt));
  const early = earlyStartAt === null ? null : Date.parse(String(earlyStartAt));
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  if (early !== null && !(early < start)) return null;
  return start;
}

/**
 * Epoch ms of his next published run, read from the file the Squeekchain console uses. Null when it
 * is not published, not readable from this origin, malformed or already past. Never guesses.
 */
export async function fetchNextLive(options: NextLiveOptions = {}): Promise<number | null> {
  const url = options.url === undefined ? LIVE_SCHEDULE_URL : options.url;
  if (url === null) return null;
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchFn(url, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const start = parseStart(await response.json());
    return start !== null && (options.now ?? Date.now)() < start ? start : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
