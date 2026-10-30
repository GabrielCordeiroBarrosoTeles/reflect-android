import type { AdbServerClient } from '@yume-chan/adb';
import type { Device } from '../devices/types';

export interface IAdbLocator {
  locate(): Promise<string>;
}

export type AdbServerClientLike = Pick<AdbServerClient, 'getVersion' | 'trackDevices' | 'createAdb'>;

export interface IAdbServerGateway {
  getClient(): Promise<AdbServerClientLike>;
}

export interface IDevicePicker {
  pick(devices: readonly Device[]): Promise<Device | undefined>;
}

export interface IDeviceSelectionService {
  select(): Promise<Device | undefined>;
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
