import type { Device } from '../devices/types';

export interface StorageEntry {
  readonly key: string;
  readonly value: string | null;
}

export type StorageResult =
  | { readonly status: 'ok'; readonly entries: readonly StorageEntry[] }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'miss' };

export interface IStorageReader {
  readAll(device: Device): Promise<StorageResult>;
  remove(device: Device, key: string): Promise<StorageResult>;
  set(device: Device, key: string, value: string): Promise<StorageResult>;
  clear(device: Device): Promise<StorageResult>;
}
