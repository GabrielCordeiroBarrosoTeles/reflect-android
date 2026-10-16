import type { Adb } from '@yume-chan/adb';
import type { DeviceInfo } from '../adb/types';
import type { Event, IDisposable } from '../core/types';

export interface DeviceLease extends IDisposable {
  readonly adb: Adb;
}

export interface IDeviceLeasePool {
  acquire(serial: string): Promise<DeviceLease>;
}

export interface IDeviceShell {
  run(serial: string, command: string): Promise<string>;
}

export interface IActiveDeviceContext {
  readonly devices: readonly DeviceInfo[];
  readonly mirroredDevice: DeviceInfo | undefined;
  readonly target: DeviceInfo | undefined;
  readonly onDidChange: Event<void>;
  setMirroredDevice(device: DeviceInfo | undefined): void;
}
