import { MAX_SOURCE_BYTES, type Hash } from '../types';

export type WalletErrorKind =
  | 'rejected'
  | 'unavailable'
  | 'wrong-network'
  | 'account-changed'
  | 'disconnected'
  | 'not-deployed'
  | 'invalid-source'
  | 'reverted'
  | 'pending'
  | 'failed';

export class WalletError extends Error {
  readonly kind: WalletErrorKind;
  /** Set once a transaction exists, so the UI can link to it. */
  readonly hash: Hash | null;

  constructor(kind: WalletErrorKind, message: string, hash: Hash | null = null) {
    super(message);
    this.name = 'WalletError';
    this.kind = kind;
    this.hash = hash;
  }
}

/** The viewer said no in their wallet. Not a failure: show nothing. */
export const isUserRejection = (error: unknown): boolean => error instanceof WalletError && error.kind === 'rejected';

type Link = Record<string, unknown>;

const MAX_CAUSE_DEPTH = 8;

function causeChain(error: unknown, depth = 0): readonly Link[] {
  if (typeof error !== 'object' || error === null || depth > MAX_CAUSE_DEPTH) return [];
  const link = error as Link;
  const nested = (link['data'] as { originalError?: unknown } | undefined)?.originalError;
  return [link, ...causeChain(link['cause'], depth + 1), ...causeChain(nested, depth + 1)];
}

const hasCode = (error: unknown, ...codes: readonly unknown[]): boolean =>
  causeChain(error).some((link) => codes.includes(link['code']));

export const isUnknownChain = (error: unknown): boolean => hasCode(error, 4902);

function describeRevert(errorName: string, args: readonly unknown[]): string {
  switch (errorName) {
    case 'SourceEmpty':
      return 'The program is empty. Write something first.';
    case 'SourceTooLong':
      return 'That program is over the 140 byte limit.';
    case 'SourceNotAscii':
      return 'Programs must be printable ASCII only.';
    case 'AlreadyQueued':
      return `You already have a program queued. It clears at cycle ${String(args[0])}.`;
    case 'UnknownProgram':
      return 'That program does not exist on-chain.';
    case 'AlreadySqueeked':
      return 'You already squeeked this program.';
    default:
      return `The contract refused: ${errorName}.`;
  }
}

/** Why the contract would refuse this source, checked in its own order. Null when it would not. */
export function sourceProblem(source: string): string | null {
  const bytes = new TextEncoder().encode(source);
  if (bytes.length === 0) return describeRevert('SourceEmpty', []);
  if (bytes.length > MAX_SOURCE_BYTES) return describeRevert('SourceTooLong', []);
  if (bytes.some((byte) => byte < 0x20 || byte > 0x7e)) return describeRevert('SourceNotAscii', []);
  return null;
}

function revertMessage(error: unknown): string | null {
  for (const link of causeChain(error)) {
    const data = link['data'] as { errorName?: unknown; args?: readonly unknown[] } | undefined;
    if (typeof data?.errorName === 'string') return describeRevert(data.errorName, data.args ?? []);
  }
  return null;
}

export function toWalletError(error: unknown, hash: Hash | null = null): WalletError {
  if (error instanceof WalletError) return error;
  if (hasCode(error, 4001, 'ACTION_REJECTED')) return new WalletError('rejected', 'Cancelled in the wallet.');
  const reverted = revertMessage(error);
  if (reverted !== null) return new WalletError('reverted', reverted, hash);
  const links = causeChain(error);
  if (links.some((link) => /insufficient funds/i.test(String(link['message'])))) {
    return new WalletError('failed', 'Not enough Sepolia ETH to pay for gas.', hash);
  }
  const short = links.map((link) => link['shortMessage']).find((message) => typeof message === 'string');
  return new WalletError('failed', typeof short === 'string' ? short : 'The wallet could not complete that request.', hash);
}
