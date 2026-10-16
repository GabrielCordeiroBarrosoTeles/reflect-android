import { describe, expect, it, vi } from 'vitest';
import { AdbPortReverse } from '../../src/device/AdbPortReverse';
import type { DeviceLease, IDeviceLeasePool } from '../../src/device/types';

const setup = (addExternal: (device: string, local: string) => Promise<string>) => {
  const dispose = vi.fn();
  const pool: IDeviceLeasePool = { acquire: vi.fn(() => Promise.resolve({ adb: { reverse: { addExternal } }, dispose } as unknown as DeviceLease)) };
  return { pool, dispose, reverse: new AdbPortReverse(pool) };
};

describe('AdbPortReverse', () => {
  it('reverses the TCP port and releases the device', async () => {
    const addExternal = vi.fn(() => Promise.resolve('tcp:8081'));
    const { reverse, dispose, pool } = setup(addExternal);
    await reverse.reverse('A', 8081);
    expect(pool.acquire).toHaveBeenCalledWith('A');
    expect(addExternal).toHaveBeenCalledWith('tcp:8081', 'tcp:8081');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('releases the device when adb refuses', async () => {
    const { reverse, dispose } = setup(() => Promise.reject(new Error('device offline')));
    await expect(reverse.reverse('A', 8081)).rejects.toThrow('device offline');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
