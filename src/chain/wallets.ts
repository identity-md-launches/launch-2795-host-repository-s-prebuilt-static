import type { WalletOption, WalletSession } from '../types';
import { WalletError } from './wallet-errors';
import type { ConnectOptions } from './wallet-session';

export interface Eip1193Provider {
  request(args: { readonly method: string; readonly params?: readonly unknown[] }): Promise<unknown>;
}

export type WalletHost = EventTarget & { readonly ethereum?: unknown };

export interface DiscoverOptions {
  readonly target?: WalletHost | null;
  readonly windowMs?: number;
}

const ANNOUNCE_EVENT = 'eip6963:announceProvider';
const REQUEST_EVENT = 'eip6963:requestProvider';
const ANNOUNCE_WINDOW_MS = 200;
const INJECTED_ID = 'injected';

let providers: ReadonlyMap<string, Eip1193Provider> = new Map();

export const providerFor = (id: string): Eip1193Provider | null => providers.get(id) ?? null;

function isProvider(value: unknown): value is Eip1193Provider {
  return typeof value === 'object' && value !== null && typeof (value as Eip1193Provider).request === 'function';
}

type Found = readonly [WalletOption, Eip1193Provider];

function readAnnouncement(detail: unknown): Found | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const { info, provider } = detail as { info?: Record<string, unknown>; provider?: unknown };
  if (info === undefined || !isProvider(provider)) return null;
  const { rdns, uuid, name, icon } = info;
  const id = typeof rdns === 'string' && rdns !== '' ? rdns : uuid;
  if (typeof id !== 'string' || id === '' || typeof name !== 'string') return null;
  const safeIcon = typeof icon === 'string' && icon.startsWith('data:image/') ? icon : null;
  return [{ id, name, icon: safeIcon }, provider];
}

function readInjected(target: WalletHost): Found | null {
  const { ethereum } = target;
  if (!isProvider(ethereum)) return null;
  const name = (ethereum as { isMetaMask?: unknown }).isMetaMask === true ? 'MetaMask' : 'Browser wallet';
  return [{ id: INJECTED_ID, name, icon: null }, ethereum];
}

const defaultHost = (): WalletHost | null => (typeof window === 'undefined' ? null : (window as unknown as WalletHost));

/** Icons are data URIs from a third-party extension: put them in an img src, never innerHTML. */
export async function discoverWallets(options: DiscoverOptions = {}): Promise<readonly WalletOption[]> {
  const target = options.target === undefined ? defaultHost() : options.target;
  if (target === null) {
    providers = new Map();
    return [];
  }

  let announced: ReadonlyMap<string, Found> = new Map();
  const listen = (event: Event) => {
    const found = readAnnouncement((event as CustomEvent<unknown>).detail);
    if (found !== null) announced = new Map([...announced, [found[0].id, found]]);
  };
  target.addEventListener(ANNOUNCE_EVENT, listen);
  target.dispatchEvent(new Event(REQUEST_EVENT));
  await new Promise((resolve) => setTimeout(resolve, options.windowMs ?? ANNOUNCE_WINDOW_MS));
  target.removeEventListener(ANNOUNCE_EVENT, listen);

  const injected = announced.size === 0 ? readInjected(target) : null;
  const found = injected === null ? [...announced.values()] : [injected];
  providers = new Map(found.map(([option, provider]) => [option.id, provider]));
  return found.map(([option]) => option);
}

/** Lazy so a viewer who never connects never downloads the transaction code. */
export async function connectWallet(id: string, options?: ConnectOptions): Promise<WalletSession> {
  const session = await import('./wallet-session').catch(() => {
    throw new WalletError('failed', 'Could not load wallet support. Check your connection and try again.');
  });
  return session.openSession(id, options);
}
