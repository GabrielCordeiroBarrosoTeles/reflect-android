import { DeviceOfflineError, DeviceUnauthorizedError, NoDeviceError } from '../core/errors';
import type { DeviceInfo, IDevicePicker, IDeviceSelectionService, IDeviceTracker } from './types';

export class DeviceSelectionService implements IDeviceSelectionService {
  constructor(
    private readonly tracker: IDeviceTracker,
    private readonly picker: IDevicePicker,
  ) {}

  async select(): Promise<DeviceInfo | undefined> {
    await this.tracker.start();
    const devices = this.tracker.devices;
    const ready = devices.filter((device) => device.state === 'device');
    if (ready.length > 0) {
      return this.picker.pick(ready);
    }
    throw this.explainUnavailability(devices);
  }

  private explainUnavailability(devices: readonly DeviceInfo[]): Error {
    const unauthorized = devices.find((device) => device.state === 'unauthorized');
    if (unauthorized) {
      return new DeviceUnauthorizedError(unauthorized.serial);
    }
    const offline = devices.find((device) => device.state === 'offline');
    if (offline) {
      return new DeviceOfflineError(offline.serial);
    }
    return new NoDeviceError();
  }
}
