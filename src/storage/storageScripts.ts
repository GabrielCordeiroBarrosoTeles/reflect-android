import type { StorageEntry } from './types';

export const STORAGE_RESULT_GLOBAL = '__reflectStorageResult';

export const READ_STORAGE_RESULT_SCRIPT = `JSON.stringify(globalThis.${STORAGE_RESULT_GLOBAL})`;

export type ParsedStorageResult =
  | { readonly status: 'pending' }
  | { readonly status: 'ok'; readonly entries: readonly StorageEntry[] }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error'; readonly message: string };

const storageScript = (operation: string): string => `(() => {
  const finish = (value) => {
    globalThis.${STORAGE_RESULT_GLOBAL} = value;
  };
  const fail = (error) => finish({ status: 'error', message: String((error && error.message) || error) });
  finish({ status: 'pending' });
  const isStorage = (candidate) =>
    !!candidate &&
    typeof candidate.getAllKeys === 'function' &&
    typeof candidate.multiGet === 'function' &&
    typeof candidate.setItem === 'function' &&
    typeof candidate.removeItem === 'function';
  const findStorage = () => {
    const metroRequire = globalThis.__r;
    const modules = metroRequire && typeof metroRequire.getModules === 'function' ? metroRequire.getModules() : null;
    if (!modules) return null;
    const records = typeof modules.values === 'function' && typeof modules.get === 'function' ? Array.from(modules.values()) : Object.keys(modules).map((id) => modules[id]);
    for (const record of records) {
      if (!record || !record.isInitialized || !record.publicModule) continue;
      const exported = record.publicModule.exports;
      if (isStorage(exported)) return exported;
      if (exported && isStorage(exported.default)) return exported.default;
    }
    return null;
  };
  const storage = findStorage();
  if (!storage) {
    finish({ status: 'unavailable' });
    return;
  }
  const readAll = () =>
    Promise.resolve(storage.getAllKeys())
      .then((keys) => storage.multiGet(keys || []))
      .then((pairs) => finish({ status: 'ok', entries: (pairs || []).map((pair) => ({ key: String(pair[0]), value: pair[1] == null ? null : String(pair[1]) })) }));
  try {
    ${operation}.catch(fail);
  } catch (error) {
    fail(error);
  }
})()`;

export const buildReadStorageScript = (): string => storageScript('readAll()');

export const buildRemoveStorageScript = (key: string): string => storageScript(`Promise.resolve(storage.removeItem(${JSON.stringify(key)})).then(readAll)`);

export const buildSetStorageScript = (key: string, value: string): string =>
  storageScript(`Promise.resolve(storage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)})).then(readAll)`);

export const buildClearStorageScript = (): string =>
  storageScript(
    "Promise.resolve(storage.getAllKeys()).then((keys) => typeof storage.multiRemove === 'function' ? storage.multiRemove(keys || []) : Promise.all((keys || []).map((key) => storage.removeItem(key)))).then(readAll)",
  );

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toEntry = (value: unknown): StorageEntry | undefined =>
  isRecord(value) && typeof value.key === 'string' && (typeof value.value === 'string' || value.value === null) ? { key: value.key, value: value.value } : undefined;

const UNEXPECTED: ParsedStorageResult = { status: 'error', message: 'Unexpected answer from the app' };

export const parseStorageResult = (raw: unknown): ParsedStorageResult => {
  let value: unknown;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : undefined;
  } catch {
    return UNEXPECTED;
  }
  if (!isRecord(value)) {
    return UNEXPECTED;
  }
  switch (value.status) {
    case 'pending':
    case 'unavailable':
      return { status: value.status };
    case 'error':
      return { status: 'error', message: String(value.message) };
    case 'ok': {
      const entries = Array.isArray(value.entries) ? value.entries.map(toEntry).filter((entry): entry is StorageEntry => entry !== undefined) : [];
      return { status: 'ok', entries: entries.sort((a, b) => a.key.localeCompare(b.key)) };
    }
    default:
      return UNEXPECTED;
  }
};
