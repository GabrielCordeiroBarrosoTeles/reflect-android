import type { Adb, AdbServerClient } from '@yume-chan/adb';
import type { AdbServerClientLike } from '../../src/adb/types';
import { FakeAdb } from './FakeAdb';
import { FakeDeviceObserver } from './FakeDeviceObserver';

export class FakeAdbServerClient implements AdbServerClientLike {
  reachable = true;
  readonly observer = new FakeDeviceObserver();
  readonly adb = new FakeAdb();
  readonly trackOptions: unknown[] = [];
  readonly createdFor: unknown[] = [];
  createAdbFailure: Error | undefined;

  getVersion(): Promise<number> {
    return this.reachable ? Promise.resolve(41) : Promise.reject(new Error('ECONNREFUSED'));
  }

  trackDevices(options?: unknown): Promise<AdbServerClient.DeviceObserver> {
    this.trackOptions.push(options);
    return Promise.resolve(this.observer.asObserver());
  }

  createAdb(device: AdbServerClient.DeviceSelector): Promise<Adb> {
    this.createdFor.push(device);
    return this.createAdbFailure ? Promise.reject(this.createAdbFailure) : Promise.resolve(this.adb.asAdb());
  }
}
