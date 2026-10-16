import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { DeviceSnapshot, IDeviceInfoCollector } from './types';

export type PollerState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loaded'; readonly snapshot: DeviceSnapshot }
  | { readonly kind: 'failed'; readonly error: unknown };

export class DeviceInfoPoller implements IDisposable {
  private readonly stateEmitter = new Emitter<PollerState>();
  private serial: string | undefined;
  private visible = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  readonly onDidChangeState = this.stateEmitter.event;

  constructor(
    private readonly collector: IDeviceInfoCollector,
    private readonly intervalMs: number,
  ) {}

  setTarget(serial: string | undefined): void {
    if (serial === this.serial) {
      return;
    }
    this.serial = serial;
    this.restart();
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    this.restart();
  }

  refresh(): void {
    this.restart();
  }

  dispose(): void {
    this.stop();
    this.stateEmitter.dispose();
  }

  private restart(): void {
    this.stop();
    if (!this.serial) {
      this.stateEmitter.fire({ kind: 'idle' });
      return;
    }
    if (this.visible) {
      void this.poll(this.serial, this.generation);
    }
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.generation += 1;
  }

  private async poll(serial: string, generation: number): Promise<void> {
    const state = await this.collector.collect(serial).then(
      (snapshot): PollerState => ({ kind: 'loaded', snapshot }),
      (error: unknown): PollerState => ({ kind: 'failed', error }),
    );
    if (generation !== this.generation) {
      return;
    }
    this.stateEmitter.fire(state);
    this.timer = setTimeout(() => void this.poll(serial, generation), this.intervalMs);
  }
}
