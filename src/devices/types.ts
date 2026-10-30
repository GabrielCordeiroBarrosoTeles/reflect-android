import type { Event, IDisposable } from '../core/types';

export type Platform = 'android' | 'ios';
export type DeviceKind = 'physical' | 'emulator' | 'simulator';
export type DeviceState = 'ready' | 'unauthorized' | 'offline' | 'shutdown';

export interface Device {
  readonly id: string;
  readonly platform: Platform;
  readonly kind: DeviceKind;
  readonly name: string;
  readonly model: string | undefined;
  readonly detail: string | undefined;
  readonly state: DeviceState;
}

export interface IDeviceDiscovery extends IDisposable {
  readonly devices: readonly Device[];
  readonly onDidChangeDevices: Event<readonly Device[]>;
  readonly onDidFail: Event<Error>;
  start(): Promise<void>;
}

export const deviceLabel = (device: Device): string => device.name;

export const isReady = (device: Device): boolean => device.state === 'ready';
