import type { AdbServerClient } from '@yume-chan/adb';
import { Emitter } from '../core/Emitter';
import type { IAdbServerGateway, DeviceInfo, IDeviceTracker } from './types';
import { toDeviceInfo } from './toDeviceInfo';

const TRACKED_STATES: readonly AdbServerClient.ConnectionState[] = ['device', 'unauthorized', 'offline'];

export class DeviceTracker implements IDeviceTracker {
  private readonly changeEmitter = new Emitter<readonly DeviceInfo[]>();
  private readonly failEmitter = new Emitter<Error>();
  private observer: AdbServerClient.DeviceObserver | undefined;
  private starting: Promise<void> | undefined;
  private current: readonly DeviceInfo[] = [];

  readonly onDidChangeDevices = this.changeEmitter.event;
  readonly onDidFail = this.failEmitter.event;

  constructor(private readonly gateway: IAdbServerGateway) {}

  get devices(): readonly DeviceInfo[] {
    return this.current;
  }

  start(): Promise<void> {
    if (this.observer) {
      return Promise.resolve();
    }
    this.starting ??= this.attach().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  dispose(): void {
    void this.observer?.stop();
    this.observer = undefined;
    this.changeEmitter.dispose();
    this.failEmitter.dispose();
  }

  private async attach(): Promise<void> {
    const client = await this.gateway.getClient();
    const observer = await client.trackDevices({ includeStates: TRACKED_STATES });
    this.observer = observer;
    this.update(observer.current);
    observer.onListChange((devices) => this.update(devices));
    observer.onError((error) => this.handleFailure(error));
  }

  private update(devices: readonly AdbServerClient.Device[]): void {
    this.current = devices.map(toDeviceInfo);
    this.changeEmitter.fire(this.current);
  }

  private handleFailure(error: Error): void {
    this.observer = undefined;
    this.update([]);
    this.failEmitter.fire(error);
  }
}
