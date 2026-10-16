import type { DeviceInfo } from '../adb/types';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { IMirrorController, MirrorClosed, MirrorControllerFactory, MirrorLocation } from './types';

export class MirrorManager implements IDisposable {
  private readonly controllers = new Map<string, IMirrorController>();
  private readonly closeEmitter = new Emitter<MirrorClosed>();

  readonly onDidClose = this.closeEmitter.event;

  constructor(private readonly createController: MirrorControllerFactory) {}

  open(device: DeviceInfo, location: MirrorLocation): void {
    const existing = this.controllers.get(device.serial);
    if (existing) {
      existing.reveal();
      return;
    }
    const controller = this.createController(device, location);
    this.controllers.set(device.serial, controller);
    controller.onDidDispose((reason) => {
      this.controllers.delete(device.serial);
      this.closeEmitter.fire({ device, location, reason });
    });
    controller.start();
  }

  get hasOpenMirror(): boolean {
    return this.controllers.size > 0;
  }

  setInspectMode(active: boolean): void {
    for (const controller of this.controllers.values()) {
      controller.setInspectMode(active);
    }
  }

  dispose(): void {
    for (const controller of [...this.controllers.values()]) {
      controller.dispose();
    }
    this.controllers.clear();
    this.closeEmitter.dispose();
  }
}
