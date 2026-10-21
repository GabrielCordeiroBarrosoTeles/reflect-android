import type { DeviceInfo } from '../adb/types';

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
  readAll(device: DeviceInfo): Promise<StorageResult>;
  remove(device: DeviceInfo, key: string): Promise<StorageResult>;
  set(device: DeviceInfo, key: string, value: string): Promise<StorageResult>;
  clear(device: DeviceInfo): Promise<StorageResult>;
}
