import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { IActiveDeviceContext } from '../device/types';
import { selectTarget } from '../inspector/selectTarget';
import type { IMetroClient } from '../inspector/types';

export class AppConnectionWatcher implements IDisposable {
  private readonly store = new DisposableStore();
  private readonly changeEmitter = new Emitter<boolean>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private connected = false;

  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly metro: Pick<IMetroClient, 'listTargets'>,
    private readonly context: IActiveDeviceContext,
    private readonly setContext: (connected: boolean) => void,
    private readonly intervalMs: number,
  ) {
    setContext(false);
    this.store.add(context.onDidChange(() => this.restart()));
    this.restart();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  dispose(): void {
    this.stop();
    this.store.dispose();
    this.changeEmitter.dispose();
  }

  private restart(): void {
    this.stop();
    const device = this.context.mirroredDevice;
    if (!device) {
      this.update(false);
      return;
    }
    void this.check(this.generation);
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.generation += 1;
  }

  private async check(generation: number): Promise<void> {
    const device = this.context.mirroredDevice;
    const found = await this.metro.listTargets().then(
      (targets) => device !== undefined && selectTarget(targets, device) !== undefined,
      () => false,
    );
    if (generation !== this.generation) {
      return;
    }
    this.update(found);
    this.timer = setTimeout(() => void this.check(generation), this.intervalMs);
  }

  private update(connected: boolean): void {
    if (connected === this.connected) {
      return;
    }
    this.connected = connected;
    this.setContext(connected);
    this.changeEmitter.fire(connected);
  }
}
