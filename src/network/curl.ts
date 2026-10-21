import type { NetworkEntry } from './types';

const quote = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

const SKIPPED_HEADERS = new Set(['content-length']);

export const toCurl = ({ method, url, requestHeaders, requestBody }: Pick<NetworkEntry, 'method' | 'url' | 'requestHeaders' | 'requestBody'>): string => {
  const parts = [`curl -X ${method} ${quote(url)}`];
  for (const [name, value] of Object.entries(requestHeaders)) {
    if (!SKIPPED_HEADERS.has(name.toLowerCase())) {
      parts.push(`-H ${quote(`${name}: ${value}`)}`);
    }
  }
  if (requestBody.text !== '') {
    parts.push(`--data-raw ${quote(requestBody.text)}`);
  }
  return parts.join(' \\\n  ');
};
