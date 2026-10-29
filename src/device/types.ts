import type { Adb } from '@yume-chan/adb';
import type { Device } from '../devices/types';
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
  readonly devices: readonly Device[];
  readonly mirroredDevice: Device | undefined;
  readonly target: Device | undefined;
  readonly onDidChange: Event<void>;
  setMirroredDevice(device: Device | undefined): void;
}
