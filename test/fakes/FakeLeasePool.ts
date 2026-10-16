import type { DeviceLease, IDeviceLeasePool } from '../../src/device/types';
import { FakeAdb } from './FakeAdb';

export class FakeLeasePool implements IDeviceLeasePool {
  readonly adb = new FakeAdb();
  readonly acquired: string[] = [];
  released = 0;
  failure: Error | undefined;

  acquire(serial: string): Promise<DeviceLease> {
    this.acquired.push(serial);
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve({ adb: this.adb.asAdb(), dispose: () => (this.released += 1) });
  }
}
