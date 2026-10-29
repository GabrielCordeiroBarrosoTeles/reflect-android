import type { Device } from '../devices/types';

export type RequestState = 'pending' | 'done' | 'error' | 'timeout' | 'abort';

export interface CapturedBody {
  readonly text: string;
  readonly truncated: boolean;
}

export interface NetworkEntry {
  readonly id: number;
  readonly method: string;
  readonly url: string;
  readonly state: RequestState;
  readonly status: number;
  readonly startedAt: number;
  readonly duration: number | undefined;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly requestBody: CapturedBody;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly responseBody: CapturedBody | undefined;
  readonly responseSize: number | undefined;
}

export type NetworkResult =
  | { readonly status: 'ok'; readonly revision: number; readonly entries: readonly NetworkEntry[] }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error'; readonly message: string };

export interface INetworkReader {
  read(device: Device, since: number): Promise<NetworkResult>;
  clear(device: Device): Promise<void>;
}
