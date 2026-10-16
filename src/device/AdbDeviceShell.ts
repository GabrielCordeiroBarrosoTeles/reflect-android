import type { IDeviceLeasePool, IDeviceShell } from './types';

export class AdbDeviceShell implements IDeviceShell {
  constructor(private readonly pool: IDeviceLeasePool) {}

  async run(serial: string, command: string): Promise<string> {
    const lease = await this.pool.acquire(serial);
    try {
      return await lease.adb.subprocess.noneProtocol.spawnWaitText(command);
    } finally {
      lease.dispose();
    }
  }
}
