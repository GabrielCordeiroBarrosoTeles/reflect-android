import type { Device, Platform } from '../devices/types';
import type { IActiveDeviceContext } from './types';

export class PlatformScopedDeviceContext implements IActiveDeviceContext {
  readonly onDidChange: IActiveDeviceContext['onDidChange'];

  constructor(
    private readonly inner: IActiveDeviceContext,
    private readonly platform: Platform,
  ) {
    this.onDidChange = inner.onDidChange;
  }

  get devices(): readonly Device[] {
    return this.inner.devices.filter((device) => device.platform === this.platform);
  }

  get mirroredDevice(): Device | undefined {
    return this.scoped(this.inner.mirroredDevice);
  }

  get target(): Device | undefined {
    return this.scoped(this.inner.target);
  }

  setMirroredDevice(device: Device | undefined): void {
    this.inner.setMirroredDevice(device);
  }

  private scoped(device: Device | undefined): Device | undefined {
    return device?.platform === this.platform ? device : undefined;
  }
}
