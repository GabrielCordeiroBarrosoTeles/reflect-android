import type { Device } from '../../src/devices/types';
import { Emitter } from '../../src/core/Emitter';
import type { IActiveDeviceContext } from '../../src/device/types';

export class FakeActiveDeviceContext implements IActiveDeviceContext {
  private readonly changeEmitter = new Emitter<void>();
  readonly onDidChange = this.changeEmitter.event;
  mirroredDevice: Device | undefined;
  target: Device | undefined;

  constructor(public devices: readonly Device[] = []) {}

  setDevices(devices: readonly Device[]): void {
    this.devices = devices;
    this.changeEmitter.fire();
  }

  setTarget(target: Device | undefined): void {
    this.target = target;
    this.changeEmitter.fire();
  }

  setMirroredDevice(device: Device | undefined): void {
    this.mirroredDevice = device;
    this.changeEmitter.fire();
  }
}
