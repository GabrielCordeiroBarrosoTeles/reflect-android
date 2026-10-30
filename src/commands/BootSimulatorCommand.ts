import type { IDevicePicker } from '../adb/types';
import type { IDisposable } from '../core/types';
import type { Device, IDeviceDiscovery } from '../devices/types';
import { isReady } from '../devices/types';
import type { ISimctl } from '../ios/types';
import { CommandIds } from './commandIds';
import type { ICommand } from './types';

interface ReadinessWait {
  readonly promise: Promise<void>;
  readonly cancel: () => void;
  readonly startTimeout: () => void;
}

interface ErrorSink {
  present(error: unknown): Promise<void>;
}

export class BootSimulatorCommand implements ICommand {
  readonly id = CommandIds.bootSimulator;

  constructor(
    private readonly simctl: ISimctl,
    private readonly discovery: Pick<IDeviceDiscovery, 'devices' | 'onDidChangeDevices'>,
    private readonly picker: IDevicePicker,
    private readonly open: (deviceId: string) => Promise<void>,
    private readonly errors: ErrorSink,
    private readonly timeoutMs: number,
  ) {}

  async execute(deviceId?: unknown): Promise<void> {
    try {
      await this.bootAndOpen(deviceId);
    } catch (error) {
      await this.errors.present(error);
    }
  }

  private async bootAndOpen(deviceId: unknown): Promise<void> {
    const id = typeof deviceId === 'string' ? deviceId : await this.pickShutdown();
    if (id === undefined) {
      return;
    }
    await this.boot(id);
    await this.open(id);
  }

  private async pickShutdown(): Promise<string | undefined> {
    const candidates = this.discovery.devices.filter((device) => device.kind === 'simulator' && device.state === 'shutdown');
    if (candidates.length === 0) {
      throw new Error('No shut-down simulator to boot');
    }
    return (await this.picker.pick(candidates))?.id;
  }

  private async boot(deviceId: string): Promise<void> {
    if (this.isBooted(this.discovery.devices, deviceId)) {
      return;
    }
    const ready = this.waitUntilReady(deviceId);
    try {
      await this.simctl.run(['boot', deviceId]);
    } catch (error) {
      ready.cancel();
      throw error;
    }
    ready.startTimeout();
    await ready.promise;
  }

  private isBooted(devices: readonly Device[], deviceId: string): boolean {
    return devices.some((device) => device.id === deviceId && isReady(device));
  }

  private waitUntilReady(deviceId: string): ReadinessWait {
    let cancel!: () => void;
    let startTimeout!: () => void;
    const promise = new Promise<void>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let settled = false;
      const finish = (settle: () => void): void => {
        settled = true;
        clearTimeout(timer);
        subscription.dispose();
        settle();
      };
      const subscription: IDisposable = this.discovery.onDidChangeDevices((devices) => {
        if (this.isBooted(devices, deviceId)) {
          finish(resolve);
        }
      });
      cancel = () => finish(resolve);
      startTimeout = () => {
        if (settled) {
          return;
        }
        timer = setTimeout(() => finish(() => reject(new Error('The simulator did not finish booting'))), this.timeoutMs);
      };
    });
    return { promise, cancel, startTimeout };
  }
}
