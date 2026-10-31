const PROGRAM_ROUTE = /^#\/p\/([A-Za-z0-9_-]+)$/;

export function encodeProgramRoute(source: string): string {
  const bytes = new TextEncoder().encode(source);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#/p/${encoded}`;
}

/** Returns the program in a share link, or null for anything malformed. */
export function decodeProgramRoute(hash: string): string | null {
  const match = PROGRAM_ROUTE.exec(hash);
  if (!match || !match[1]) return null;
  try {
    const binary = atob(match[1].replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function shareUrl(source: string): string {
  const { origin, pathname } = window.location;
  const base = origin === 'null' ? window.location.href.split('#')[0] : `${origin}${pathname}`;
  return `${base}${encodeProgramRoute(source)}`;
}
