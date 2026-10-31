import { createClient, fallback, http } from 'viem';
import { SEPOLIA, SEPOLIA_RPC_URLS } from './config';

export interface ReadClientOptions {
  readonly urls?: readonly string[];
  readonly fetch?: typeof fetch;
}

/** Tenderly refused batches of 5 or more. Every listed RPC accepted 4 at a viewer's pace. */
export const MAX_CALLS_PER_POST = 4;
const REQUEST_TIMEOUT_MS = 6_000;
const RECEIPT_POLL_MS = 3_000;

export function createReadClient(options: ReadClientOptions = {}) {
  const urls = options.urls ?? SEPOLIA_RPC_URLS;
  const transports = urls.map((url) =>
    http(url, {
      batch: { batchSize: MAX_CALLS_PER_POST, wait: 16 },
      retryCount: 0,
      timeout: REQUEST_TIMEOUT_MS,
      ...(options.fetch ? { fetchFn: options.fetch } : {}),
    }),
  );
  return createClient({
    chain: SEPOLIA,
    pollingInterval: RECEIPT_POLL_MS,
    transport: fallback(transports, { retryCount: 1, retryDelay: 200 }),
  });
}

export type ReadClient = ReturnType<typeof createReadClient>;
