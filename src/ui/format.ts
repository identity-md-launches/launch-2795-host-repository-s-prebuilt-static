import type { Address } from '../types';

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const cycles = (value: number): string => grouped.format(Math.floor(value));

export const hz = (value: number): string => value.toFixed(2);

export const shortAddress = (address: Address): string =>
  `${address.slice(0, 6)}...${address.slice(-4)}`;

export function secondsAgo(now: number, then: number): string {
  if (!then) return 'NEVER';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return `${seconds}S AGO`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}M AGO`;
  return `${Math.round(minutes / 60)}H AGO`;
}

export function utcClock(epochMs: number): string {
  const date = new Date(epochMs);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function untilClock(now: number, epochMs: number): string {
  const minutes = Math.max(0, Math.round((epochMs - now) / 60000));
  if (minutes < 60) return `${minutes}M`;
  return `${Math.floor(minutes / 60)}H ${String(minutes % 60).padStart(2, '0')}M`;
}
