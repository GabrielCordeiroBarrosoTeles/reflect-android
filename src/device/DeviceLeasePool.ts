import type { Adb } from '@yume-chan/adb';
import type { IAdbServerGateway } from '../adb/types';
import type { IDisposable, ILogger } from '../core/types';
import type { DeviceLease, IDeviceLeasePool } from './types';

interface PoolEntry {
  readonly adb: Promise<Adb>;
  count: number;
}

export class DeviceLeasePool implements IDeviceLeasePool, IDisposable {
  private readonly entries = new Map<string, PoolEntry>();

  constructor(
    private readonly gateway: IAdbServerGateway,
    private readonly logger: ILogger,
  ) {}

  async acquire(serial: string): Promise<DeviceLease> {
    const entry = this.entries.get(serial) ?? this.connect(serial);
    entry.count += 1;
    let adb: Adb;
    try {
      adb = await entry.adb;
    } catch (error) {
      if (this.entries.get(serial) === entry) {
        this.entries.delete(serial);
      }
      throw error;
    }
    let released = false;
    return {
      adb,
      dispose: () => {
        if (released) {
          return;
        }
        released = true;
        this.release(serial, entry);
      },
    };
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      this.close(entry);
    }
    this.entries.clear();
  }

  private connect(serial: string): PoolEntry {
    const entry: PoolEntry = {
      adb: this.gateway.getClient().then((client) => client.createAdb({ serial })),
      count: 0,
    };
    this.entries.set(serial, entry);
    return entry;
  }

  private release(serial: string, entry: PoolEntry): void {
    entry.count -= 1;
    if (entry.count > 0) {
      return;
    }
    this.entries.delete(serial);
    this.close(entry);
  }

  private close(entry: PoolEntry): void {
    void entry.adb
      .then((adb) => adb.close())
      .catch((error: unknown) => this.logger.error('Failed to close adb connection', error));
  }
}
