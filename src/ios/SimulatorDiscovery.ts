import { Emitter } from '../core/Emitter';
import type { ILogger } from '../core/types';
import type { Device, IDeviceDiscovery } from '../devices/types';
import { parseSimctlDevices } from './parseSimctlDevices';
import type { ISimctl } from './types';

const signature = (devices: readonly Device[]): string => devices.map((device) => `${device.id}:${device.state}`).join('|');

export class SimulatorDiscovery implements IDeviceDiscovery {
  private readonly changeEmitter = new Emitter<readonly Device[]>();
  private readonly failEmitter = new Emitter<Error>();
  private current: readonly Device[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private failureLogged = false;
  private disposed = false;

  readonly onDidChangeDevices = this.changeEmitter.event;
  readonly onDidFail = this.failEmitter.event;

  constructor(
    private readonly simctl: ISimctl,
    private readonly logger: ILogger,
    private readonly intervalMs: number,
  ) {}

  get devices(): readonly Device[] {
    return this.current;
  }

  async start(): Promise<void> {
    if (this.timer || this.disposed) {
      return;
    }
    this.timer = setInterval(() => void this.poll(), this.intervalMs);
    await this.poll();
  }

  dispose(): void {
    this.disposed = true;
    clearInterval(this.timer);
    this.timer = undefined;
    this.changeEmitter.dispose();
    this.failEmitter.dispose();
  }

  private async poll(): Promise<void> {
    try {
      this.update(parseSimctlDevices(await this.simctl.run(['list', 'devices', '-j'])));
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
    if (!this.failureLogged) {
      this.failureLogged = true;
      this.logger.error('iOS Simulator discovery unavailable', error);
    }
  }
}
