import { NoDeviceError } from '../core/errors';
import { isReady, type Device } from '../devices/types';
import type { IDeviceSelectionService } from '../adb/types';
import type { IActiveDeviceContext } from '../device/types';
import type { MirrorManager } from '../mirror/MirrorManager';
import type { MirrorLocation } from '../mirror/types';
import type { ErrorPresenter } from '../ui/ErrorPresenter';
import type { ICommand } from './types';

export class OpenDeviceCommand implements ICommand {
  constructor(
    readonly id: string,
    private readonly location: () => MirrorLocation,
    private readonly selection: IDeviceSelectionService,
    private readonly mirrors: MirrorManager,
    private readonly activeDevice: IActiveDeviceContext,
    private readonly errors: ErrorPresenter,
  ) {}

  async execute(deviceId?: unknown): Promise<void> {
    try {
      const device = typeof deviceId === 'string' ? this.findReady(deviceId) : await this.selection.select();
      if (!device) {
        return;
      }
      this.activeDevice.setMirroredDevice(device);
      this.mirrors.open(device, this.location());
    } catch (error) {
      await this.errors.present(error);
    }
  }

  private findReady(deviceId: string): Device {
    const device = this.activeDevice.devices.find((candidate) => candidate.id === deviceId && isReady(candidate));
    if (!device) {
      throw new NoDeviceError();
    }
    return device;
  }
}
