import type { IDisposable } from '../core/types';
import { DeviceOfflineError, DeviceUnauthorizedError, NoDeviceError } from '../core/errors';
import { isReady, type Device, type IDeviceDiscovery } from '../devices/types';
import type { IDevicePicker, IDeviceSelectionService } from './types';

export class DeviceSelectionService implements IDeviceSelectionService, IDisposable {
  private failures: Error[] = [];
  private readonly subscription: IDisposable;

  constructor(
    private readonly tracker: IDeviceDiscovery,
    private readonly picker: IDevicePicker,
  ) {
    this.subscription = tracker.onDidFail((error) => this.failures.push(error));
  }

  async select(): Promise<Device | undefined> {
    this.failures = [];
    await this.tracker.start();
    const devices = this.tracker.devices;
    const ready = devices.filter((device) => isReady(device));
    if (ready.length > 0) {
      return this.picker.pick(ready);
    }
    throw this.failures[0] ?? this.explainUnavailability(devices);
  }

  dispose(): void {
    this.subscription.dispose();
  }

  private explainUnavailability(devices: readonly Device[]): Error {
    const unauthorized = devices.find((device) => device.state === 'unauthorized');
    if (unauthorized) {
      return new DeviceUnauthorizedError(unauthorized.id);
    }
    const offline = devices.find((device) => device.state === 'offline');
    if (offline) {
      return new DeviceOfflineError(offline.id);
    }
    return new NoDeviceError();
  }
}
