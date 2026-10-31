import { describe, expect, it, vi } from 'vitest';
import { fetchNextLive } from './next-live';
import { T0, jsonResponse } from './test-helpers';

const START = T0 + 9_660_000;
const iso = (time: number) => new Date(time).toISOString();
const published = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  occurrence: { earlyStartAt: null, startAt: iso(START), endAt: iso(START + 3_600_000), ...overrides },
  observedAt: iso(T0),
});
const fromBody = (body: unknown, status = 200) => (async () => jsonResponse(body, { status })) as unknown as typeof fetch;
const next = (fetchFn: typeof fetch, now = T0) =>
  fetchNextLive({ fetch: fetchFn, now: () => now, url: 'https://media.test/live/schedule.json' });

describe('fetchNextLive', () => {
  it('returns the published start as epoch ms', async () => {
    expect(await next(fromBody(published()))).toBe(START);
  });

  it('accepts an early start, which the console shows as MAYBE EARLIER', async () => {
    expect(await next(fromBody(published({ earlyStartAt: iso(START - 1_800_000) })))).toBe(START);
  });

  it('returns null once the start has passed, even inside the run window', async () => {
    expect(await next(fromBody(published()), START)).toBeNull();
  });

  it.each<[string, unknown]>([
    ['an unknown schema version', { ...published(), schemaVersion: 2 }],
    ['a null occurrence', { ...published(), occurrence: null }],
    ['a missing body', null],
    ['an unparseable start', published({ startAt: 'tonight' })],
    ['an end before the start', published({ endAt: iso(START - 1) })],
    ['an early start after the start', published({ earlyStartAt: iso(START + 1) })],
  ])('returns null for %s rather than guessing', async (_name, body) => {
    expect(await next(fromBody(body))).toBeNull();
  });

  it('ignores the body of an error response', async () => {
    expect(await next(fromBody(published(), 404))).toBeNull();
  });

  it('returns null when the browser blocks the read', async () => {
    const blocked = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await next(blocked)).toBeNull();
  });

  it('makes no request when no URL is configured', async () => {
    const spy = vi.fn() as unknown as typeof fetch;
    expect(await fetchNextLive({ fetch: spy, url: null })).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
