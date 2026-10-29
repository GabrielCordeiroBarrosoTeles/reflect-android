import type { Device, IDeviceDiscovery } from '../../src/devices/types';
import { Emitter } from '../../src/core/Emitter';

export class FakeDeviceTracker implements IDeviceDiscovery {
  private readonly changeEmitter = new Emitter<readonly Device[]>();
  private readonly failEmitter = new Emitter<Error>();
  readonly onDidChangeDevices = this.changeEmitter.event;
  readonly onDidFail = this.failEmitter.event;
  started = 0;
  disposed = 0;
  startFailure: Error | undefined;

  constructor(public devices: readonly Device[] = []) {}

  setDevices(devices: readonly Device[]): void {
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
