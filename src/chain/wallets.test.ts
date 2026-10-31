import { afterEach, describe, expect, it, vi } from 'vitest';
import { WalletError } from './wallet-errors';
import { connectWallet, discoverWallets, type WalletHost } from './wallets';

const provider = () => ({ request: async () => null });
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function host(announcements: readonly unknown[], ethereum?: unknown): WalletHost {
  const target = new EventTarget();
  target.addEventListener('eip6963:requestProvider', () => {
    announcements.forEach((detail) => target.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail })));
  });
  return Object.assign(target, ethereum === undefined ? {} : { ethereum });
}

const announcement = (rdns: string, name: string, icon = PNG, uuid = `uuid-${rdns}`) => ({
  info: { uuid, name, icon, rdns },
  provider: provider(),
});

const discover = (target: WalletHost | null) => discoverWallets({ target, windowMs: 1 });

describe('discoverWallets', () => {
  it('lists every EIP-6963 wallet that answers', async () => {
    const wallets = await discover(host([announcement('io.metamask', 'MetaMask'), announcement('io.rabby', 'Rabby')]));
    expect(wallets).toEqual([
      { id: 'io.metamask', name: 'MetaMask', icon: PNG },
      { id: 'io.rabby', name: 'Rabby', icon: PNG },
    ]);
  });

  it('collapses a wallet that announces twice', async () => {
    const wallets = await discover(host([announcement('io.rabby', 'Rabby'), announcement('io.rabby', 'Rabby')]));
    expect(wallets).toHaveLength(1);
  });

  it('falls back to the uuid when a wallet has no rdns', async () => {
    const wallets = await discover(host([announcement('', 'Quiet Wallet', PNG, 'uuid-1')]));
    expect(wallets[0]?.id).toBe('uuid-1');
  });

  it('refuses an icon that would make the page fetch a remote URL', async () => {
    const wallets = await discover(host([announcement('io.tracker', 'Tracker', 'https://tracker.example/pixel.png')]));
    expect(wallets[0]?.icon).toBeNull();
  });

  it.each<[string, unknown]>([
    ['no provider', { info: { uuid: 'a', name: 'A', icon: PNG, rdns: 'a' } }],
    ['a provider that cannot request', { info: { uuid: 'b', name: 'B', icon: PNG, rdns: 'b' }, provider: {} }],
    ['no info', { provider: provider() }],
    ['nothing at all', null],
  ])('ignores an announcement with %s', async (_name, detail) => {
    expect(await discover(host([detail]))).toEqual([]);
  });

  it('falls back to window.ethereum when nothing announces', async () => {
    expect(await discover(host([], { ...provider(), isMetaMask: true }))).toEqual([
      { id: 'injected', name: 'MetaMask', icon: null },
    ]);
  });

  it('labels an unknown injected provider generically', async () => {
    expect(await discover(host([], provider()))).toEqual([{ id: 'injected', name: 'Browser wallet', icon: null }]);
  });

  it('prefers announcements over the legacy global, which would be a duplicate', async () => {
    const wallets = await discover(host([announcement('io.metamask', 'MetaMask')], provider()));
    expect(wallets.map((wallet) => wallet.id)).toEqual(['io.metamask']);
  });

  it('ignores a window.ethereum that is not a provider', async () => {
    expect(await discover(host([], { isMetaMask: true }))).toEqual([]);
  });

  it('returns nothing when there is no wallet', async () => {
    expect(await discover(host([]))).toEqual([]);
  });

  it('returns nothing outside a browser', async () => {
    expect(await discover(null)).toEqual([]);
  });

  it('stops listening after the discovery window', async () => {
    const target = host([]);
    const added = vi.spyOn(target, 'addEventListener');
    const removed = vi.spyOn(target, 'removeEventListener');
    await discover(target);
    const listener = added.mock.calls.find(([type]) => type === 'eip6963:announceProvider')?.[1];
    expect(listener).toBeDefined();
    expect(removed).toHaveBeenCalledWith('eip6963:announceProvider', listener);
  });
});

describe('connectWallet', () => {
  afterEach(() => {
    vi.doUnmock('./wallet-session');
  });

  it('explains a failed chunk download rather than leaking a browser error', async () => {
    vi.doMock('./wallet-session', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const outcome = await connectWallet('any').catch((error: unknown) => error);
    expect(outcome).toBeInstanceOf(WalletError);
    expect(outcome).toMatchObject({ kind: 'failed' });
    expect((outcome as WalletError).message).not.toMatch(/dynamically imported/i);
  });
});
