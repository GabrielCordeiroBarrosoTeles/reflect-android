import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import type { Device, IDeviceDiscovery } from './types';

export class CompositeDeviceDiscovery implements IDeviceDiscovery {
  private readonly changeEmitter = new Emitter<readonly Device[]>();
  private readonly failEmitter = new Emitter<Error>();
  private readonly store = new DisposableStore();

  readonly onDidChangeDevices = this.changeEmitter.event;
  readonly onDidFail = this.failEmitter.event;

  constructor(private readonly sources: readonly IDeviceDiscovery[]) {
    for (const source of sources) {
      this.store.add(source.onDidChangeDevices(() => this.changeEmitter.fire(this.devices)));
      this.store.add(source.onDidFail((error) => this.failEmitter.fire(error)));
    }
  }

  get devices(): readonly Device[] {
    return this.sources.flatMap((source) => source.devices);
  }

  async start(): Promise<void> {
    const results = await Promise.allSettled(this.sources.map((source) => source.start()));
    for (const result of results) {
      if (result.status === 'rejected') {
        this.failEmitter.fire(result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
      }
    }
  }

  dispose(): void {
    this.store.dispose();
    this.changeEmitter.dispose();
    this.failEmitter.dispose();
    for (const source of this.sources) {
      source.dispose();
    }
  }
}
