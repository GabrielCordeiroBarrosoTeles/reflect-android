import type { Event } from '../core/types';
import type { DeviceAvailability } from '../mirror/AutoReconnect';
import type { IDeviceDiscovery } from './types';
import { isReady } from './types';

export class DiscoveryAvailability implements DeviceAvailability {
  readonly onDidChange: Event<void>;

  constructor(private readonly discovery: Pick<IDeviceDiscovery, 'devices' | 'onDidChangeDevices'>) {
    this.onDidChange = (listener) => discovery.onDidChangeDevices(() => listener());
  }

  isReady(serial: string): boolean {
    return this.discovery.devices.some((device) => device.id === serial && isReady(device));
  }
}
