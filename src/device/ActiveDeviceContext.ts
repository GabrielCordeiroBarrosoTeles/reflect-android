import type { DeviceInfo, IDeviceTracker } from '../adb/types';
import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { IActiveDeviceContext } from './types';

export class ActiveDeviceContext implements IActiveDeviceContext, IDisposable {
  private readonly changeEmitter = new Emitter<void>();
  private readonly store = new DisposableStore();
  private mirrored: DeviceInfo | undefined;

  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly tracker: IDeviceTracker) {
    this.store.add(tracker.onDidChangeDevices(() => this.changeEmitter.fire()));
  }

  get devices(): readonly DeviceInfo[] {
    return this.tracker.devices;
  }

  get mirroredDevice(): DeviceInfo | undefined {
    return this.mirrored;
  }

  get target(): DeviceInfo | undefined {
    const ready = this.devices.filter((device) => device.state === 'device');
    return ready.find((device) => device.serial === this.mirrored?.serial) ?? ready[0];
  }

  setMirroredDevice(device: DeviceInfo | undefined): void {
    this.mirrored = device;
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.store.dispose();
    this.changeEmitter.dispose();
  }
}
