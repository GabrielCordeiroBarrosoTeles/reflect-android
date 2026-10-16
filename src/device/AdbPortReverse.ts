import type { IDeviceLeasePool } from './types';

export class AdbPortReverse {
  constructor(private readonly pool: IDeviceLeasePool) {}

  async reverse(serial: string, port: number): Promise<void> {
    const lease = await this.pool.acquire(serial);
    try {
      await lease.adb.reverse.addExternal(`tcp:${port}`, `tcp:${port}`);
    } finally {
      lease.dispose();
    }
  }
}
