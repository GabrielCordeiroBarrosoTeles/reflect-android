import type { NetworkEntry } from '../../network/types';
import { formatBytes, toEditableText } from '../../storage/storageValue';

export type StatusFilter = 'all' | '2' | '3' | '4' | '5' | 'failed';

const FAILED_STATES: ReadonlySet<NetworkEntry['state']> = new Set(['error', 'timeout', 'abort']);

export const isFailed = (entry: NetworkEntry): boolean => FAILED_STATES.has(entry.state) || (entry.state === 'done' && entry.status === 0);

export const matchesStatus = (entry: NetworkEntry, filter: StatusFilter): boolean => {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'failed') {
    return isFailed(entry);
  }
  return String(entry.status).startsWith(filter) && entry.state === 'done';
};

export const pathOf = (url: string): string => {
  const match = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+(.*)$/i.exec(url);
  return match?.[1] || url;
};

export const hostOf = (url: string): string => /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url)?.[1] ?? '';

export const statusLabel = (entry: NetworkEntry): string => {
  if (entry.state === 'pending') {
    return '…';
  }
  return isFailed(entry) ? entry.state.toUpperCase() : String(entry.status);
};

export const statusClass = (entry: NetworkEntry): string => {
  if (entry.state === 'pending') {
    return 'pending';
  }
  return isFailed(entry) ? 'failed' : `s${String(entry.status).charAt(0)}xx`;
};

export const durationLabel = (entry: NetworkEntry): string => (entry.duration === undefined ? '' : `${entry.duration} ms`);

export const sizeLabel = (entry: NetworkEntry): string => (entry.responseSize === undefined ? '' : formatBytes(entry.responseSize));

export const prettyBody = (text: string): string => toEditableText(text);
