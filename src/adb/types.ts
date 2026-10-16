import type { AdbServerClient } from '@yume-chan/adb';
import type { Event, IDisposable } from '../core/types';

export type DeviceState = 'device' | 'unauthorized' | 'offline';

export interface DeviceInfo {
  readonly serial: string;
  readonly state: DeviceState;
  readonly model: string | undefined;
  readonly product: string | undefined;
  readonly transportId: bigint;
}

export interface IAdbLocator {
  locate(): Promise<string>;
}

export type AdbServerClientLike = Pick<AdbServerClient, 'getVersion' | 'trackDevices' | 'createAdb'>;

export interface IAdbServerGateway {
  getClient(): Promise<AdbServerClientLike>;
}

export interface IDeviceTracker extends IDisposable {
  readonly devices: readonly DeviceInfo[];
  readonly onDidChangeDevices: Event<readonly DeviceInfo[]>;
  readonly onDidFail: Event<Error>;
  start(): Promise<void>;
}

export interface IDevicePicker {
  pick(devices: readonly DeviceInfo[]): Promise<DeviceInfo | undefined>;
}

export interface IDeviceSelectionService {
  select(): Promise<DeviceInfo | undefined>;
}

export interface ProcessRunner {
  run(executable: string, args: readonly string[]): Promise<void>;
}

export type ExecFileFunction = (
  file: string,
  args: string[],
  options: { readonly timeout: number },
) => Promise<unknown>;

export interface AdbServerEndpoint {
  readonly host: string;
  readonly port: number;
}
