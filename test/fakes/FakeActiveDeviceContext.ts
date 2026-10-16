import type { DeviceInfo } from '../../src/adb/types';
import { Emitter } from '../../src/core/Emitter';
import type { IActiveDeviceContext } from '../../src/device/types';

export class FakeActiveDeviceContext implements IActiveDeviceContext {
  private readonly changeEmitter = new Emitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  mirroredDevice: DeviceInfo | undefined;
  target: DeviceInfo | undefined;

  constructor(public devices: readonly DeviceInfo[] = []) {}

  setDevices(devices: readonly DeviceInfo[]): void {
    this.devices = devices;
    this.changeEmitter.fire();
  }

  setTarget(target: DeviceInfo | undefined): void {
    this.target = target;
    this.changeEmitter.fire();
  }

  setMirroredDevice(device: DeviceInfo | undefined): void {
    this.mirroredDevice = device;
    this.changeEmitter.fire();
  }
}
