import { isReady, type Device, type IDeviceDiscovery } from '../devices/types';
import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { IActiveDeviceContext } from './types';

export class ActiveDeviceContext implements IActiveDeviceContext, IDisposable {
  private readonly changeEmitter = new Emitter<void>();
  private readonly store = new DisposableStore();
  private mirrored: Device | undefined;

  readonly onDidChange = this.changeEmitter.event;

  constructor(private readonly tracker: IDeviceDiscovery) {
    this.store.add(tracker.onDidChangeDevices(() => this.changeEmitter.fire()));
  }

  get devices(): readonly Device[] {
    return this.tracker.devices;
  }

  get mirroredDevice(): Device | undefined {
    return this.mirrored;
  }

  get target(): Device | undefined {
    const ready = this.devices.filter((device) => isReady(device));
    return ready.find((device) => device.id === this.mirrored?.id) ?? ready[0];
  }

  setMirroredDevice(device: Device | undefined): void {
    this.mirrored = device;
    this.changeEmitter.fire();
  }

  dispose(): void {
    this.store.dispose();
    this.changeEmitter.dispose();
  }
}
