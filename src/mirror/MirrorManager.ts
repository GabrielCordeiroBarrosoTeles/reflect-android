import type { Device } from '../devices/types';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { ActionId } from '../shared/actions';
import type { IMirrorController, MirrorClosed, MirrorControllerFactory, MirrorLocation } from './types';

export type ActionOutcome = 'ran' | 'no-mirror' | 'unsupported';

interface OpenMirror {
  readonly controller: IMirrorController;
  readonly location: MirrorLocation;
}

export class MirrorManager implements IDisposable {
  private readonly controllers = new Map<string, OpenMirror>();
  private readonly closeEmitter = new Emitter<MirrorClosed>();
  private readonly openEmitter = new Emitter<Device>();

  readonly onDidClose = this.closeEmitter.event;
  readonly onDidOpen = this.openEmitter.event;

  constructor(private readonly createController: MirrorControllerFactory) {}

  open(device: Device, location: MirrorLocation): void {
    const existing = this.controllers.get(device.id);
    if (existing) {
      existing.controller.reveal();
      return;
    }
    const controller = this.createController(device, location);
    this.controllers.set(device.id, { controller, location });
    controller.onDidDispose((reason) => {
      this.controllers.delete(device.id);
      this.closeEmitter.fire({ device, location, reason });
    });
    controller.start();
    this.openEmitter.fire(device);
  }

  move(location: MirrorLocation): boolean {
    const latest = this.latest();
    if (!latest) {
      return false;
    }
    const { controller } = latest;
    if (latest.location !== location) {
      controller.dispose();
      this.open(controller.device, location);
    } else {
      controller.reveal();
    }
    return true;
  }

  get hasOpenMirror(): boolean {
    return this.controllers.size > 0;
  }

  private latest(): OpenMirror | undefined {
    return [...this.controllers.values()].at(-1);
  }

  runAction(id: ActionId): ActionOutcome {
    const latest = this.latest();
    if (!latest) {
      return 'no-mirror';
    }
    if (!latest.controller.supports(id)) {
      return 'unsupported';
    }
    void latest.controller.runAction(id);
    return 'ran';
  }

  setInspectMode(active: boolean): void {
    for (const { controller } of this.controllers.values()) {
      controller.setInspectMode(active);
    }
  }

  dispose(): void {
    for (const { controller } of [...this.controllers.values()]) {
      controller.dispose();
    }
    this.controllers.clear();
    this.closeEmitter.dispose();
    this.openEmitter.dispose();
  }
}
