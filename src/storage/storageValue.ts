export type StorageValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * KILOBYTE;
const JSON_INDENT = 2;

export const KIND_ICONS: Readonly<Record<StorageValueKind, string>> = {
  object: '{}',
  array: '[]',
  string: '""',
  number: '#',
  boolean: '✓',
  null: '∅',
};

export const KIND_LABELS: Readonly<Record<StorageValueKind, string>> = {
  object: 'JSON object',
  array: 'JSON array',
  string: 'text',
  number: 'number',
  boolean: 'boolean',
  null: 'null',
};

export const parseStorageValue = (raw: string | null): unknown => {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
};

const isContainer = (value: unknown): value is object => typeof value === 'object' && value !== null;

export const valueKind = (raw: string | null): StorageValueKind => {
  const value = parseStorageValue(raw);
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  const kind = typeof value;
  return kind === 'object' || kind === 'number' || kind === 'boolean' ? kind : 'string';
};

export const byteSize = (raw: string | null): number => new TextEncoder().encode(raw ?? '').length;

export const formatBytes = (bytes: number): string => {
  if (bytes < KILOBYTE) {
    return `${bytes} B`;
  }
  return bytes < MEGABYTE ? `${(bytes / KILOBYTE).toFixed(1)} KB` : `${(bytes / MEGABYTE).toFixed(1)} MB`;
};

export const toEditableText = (raw: string | null): string => {
  const value = parseStorageValue(raw);
  return isContainer(value) ? JSON.stringify(value, null, JSON_INDENT) : (raw ?? '');
};

export const jsonProblem = (text: string): string | undefined => {
  try {
    JSON.parse(text);
    return undefined;
  } catch (error) {
    return (error as Error).message;
  }
};

export const toStoredText = (original: string | null, text: string): string => {
  const keepsLayout = original === null || original.includes('\n') || !isContainer(parseStorageValue(original));
  return keepsLayout || jsonProblem(text) !== undefined ? text : JSON.stringify(JSON.parse(text));
};

const IMAGE_URL = /^https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|gif|webp|svg|bmp|ico|avif)(?:[?#][^\s"'<>]*)?$/i;
const IMAGE_DATA = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml|bmp|avif);base64,[A-Za-z0-9+/=]+$/;

export const imageSourceOf = (text: string): string | undefined => {
  const candidate = text.trim();
  return IMAGE_URL.test(candidate) || IMAGE_DATA.test(candidate) ? candidate : undefined;
};
