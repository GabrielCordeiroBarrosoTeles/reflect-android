import type { DeviceInfo, IDeviceTracker } from '../../src/adb/types';
import { Emitter } from '../../src/core/Emitter';

export class FakeDeviceTracker implements IDeviceTracker {
  private readonly changeEmitter = new Emitter<readonly DeviceInfo[]>();
  private readonly failEmitter = new Emitter<Error>();
  readonly onDidChangeDevices = this.changeEmitter.event;
  readonly onDidFail = this.failEmitter.event;
  started = 0;
  disposed = 0;
  startFailure: Error | undefined;

  constructor(public devices: readonly DeviceInfo[] = []) {}

  setDevices(devices: readonly DeviceInfo[]): void {
    this.devices = devices;
    this.changeEmitter.fire(devices);
  }

  start(): Promise<void> {
    this.started += 1;
    return this.startFailure ? Promise.reject(this.startFailure) : Promise.resolve();
  }

  dispose(): void {
    this.disposed += 1;
  }
}
