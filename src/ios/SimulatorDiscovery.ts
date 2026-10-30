import { Emitter } from '../core/Emitter';
import type { ILogger } from '../core/types';
import type { Device, IDeviceDiscovery } from '../devices/types';
import { parseSimctlDevices } from './parseSimctlDevices';
import type { ISimctl } from './types';

export interface SimulatorPollTiming {
  readonly intervalMs: number;
  readonly failureBackoffMs: number;
  readonly maxFailureBackoffMs: number;
}

const signature = (devices: readonly Device[]): string => devices.map((device) => `${device.id}:${device.state}`).join('|');

export class SimulatorDiscovery implements IDeviceDiscovery {
  private readonly changeEmitter = new Emitter<readonly Device[]>();
  private readonly failEmitter = new Emitter<Error>();
  private current: readonly Device[] = [];
  private timer: ReturnType<typeof setTimeout> | undefined;
  private started = false;
  private failures = 0;
  private disposed = false;

  readonly onDidChangeDevices = this.changeEmitter.event;
  readonly onDidFail = this.failEmitter.event;

  constructor(
    private readonly simctl: ISimctl,
    private readonly logger: ILogger,
    private readonly timing: SimulatorPollTiming,
    private readonly simulatorsInstalled: () => Promise<boolean>,
  ) {}

  get devices(): readonly Device[] {
    return this.current;
  }

  async start(): Promise<void> {
    if (this.started || this.disposed) {
      return;
    }
    this.started = true;
    const installed = await this.simulatorsInstalled();
    if (this.disposed) {
      return;
    }
    if (!installed) {
      this.logger.info('iOS Simulator support is off: Xcode (CoreSimulator) is not installed');
      return;
    }
    await this.poll();
    this.scheduleNext();
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.changeEmitter.dispose();
    this.failEmitter.dispose();
  }

  private scheduleNext(): void {
    if (this.disposed) {
      return;
    }
    this.timer = setTimeout(() => {
      void this.poll().then(() => this.scheduleNext());
    }, this.nextDelayMs());
  }

  private nextDelayMs(): number {
    if (this.failures === 0) {
      return this.timing.intervalMs;
    }
    return Math.min(this.timing.failureBackoffMs * 2 ** (this.failures - 1), this.timing.maxFailureBackoffMs);
  }

  private async poll(): Promise<void> {
    try {
      this.update(parseSimctlDevices(await this.simctl.run(['list', 'devices', '-j'])));
      this.failures = 0;
    } catch (error) {
      this.reportFailure(error);
      this.update([]);
    }
  }

  private update(devices: readonly Device[]): void {
    if (this.disposed || signature(devices) === signature(this.current)) {
      return;
    }
    this.current = devices;
    this.changeEmitter.fire(devices);
  }

  private reportFailure(error: unknown): void {
    this.failures += 1;
    if (this.failures === 1) {
      this.logger.error('iOS Simulator discovery unavailable', error);
    }
  }
}
