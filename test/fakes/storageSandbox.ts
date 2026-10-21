import { createContext, runInContext } from 'node:vm';

export interface FakeStorageOptions {
  readonly asMap?: boolean;
  readonly asDefault?: boolean;
  readonly failWith?: string;
  readonly withoutMultiRemove?: boolean;
}

export const createStorageSandbox = (data: Record<string, string | null>, options: FakeStorageOptions = {}) => {
  const store = { ...data };
  const storage = {
    getAllKeys: () => (options.failWith ? Promise.reject(new Error(options.failWith)) : Promise.resolve(Object.keys(store))),
    multiGet: (keys: string[]) => Promise.resolve(keys.map((key) => [key, store[key]])),
    setItem: (key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      delete store[key];
      return Promise.resolve();
    },
    ...(options.withoutMultiRemove
      ? {}
      : {
          multiRemove: (keys: string[]) => {
            keys.forEach((key) => delete store[key]);
            return Promise.resolve();
          },
        }),
  };
  const exports = options.asDefault ? { default: storage } : storage;
  const records = [
    { isInitialized: false, publicModule: { exports: storage } },
    null,
    { isInitialized: true },
    { isInitialized: true, publicModule: { exports: { other: true } } },
    { isInitialized: true, publicModule: { exports: null } },
    { isInitialized: true, publicModule: { exports } },
  ];
  const modules = options.asMap ? new Map(records.map((record, index) => [index, record])) : Object.fromEntries(records.map((record, index) => [index, record]));
  const context = createContext({ __r: { getModules: () => modules } });
  return {
    store,
    context,
    evaluate: (script: string): Promise<unknown> => Promise.resolve(runInContext(script, context) as unknown),
  };
};

export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
