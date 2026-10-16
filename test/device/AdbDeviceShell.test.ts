import { describe, expect, it, vi } from 'vitest';
import { AdbDeviceShell } from '../../src/device/AdbDeviceShell';
import type { DeviceLease, IDeviceLeasePool } from '../../src/device/types';

const setup = (spawnWaitText: (command: string) => Promise<string>) => {
  const dispose = vi.fn();
  const pool: IDeviceLeasePool = {
    acquire: vi.fn(() => Promise.resolve({ adb: { subprocess: { noneProtocol: { spawnWaitText } } }, dispose } as unknown as DeviceLease)),
  };
  return { pool, dispose, shell: new AdbDeviceShell(pool) };
};

describe('AdbDeviceShell', () => {
  it('runs the command on the leased device and releases it', async () => {
    const spawn = vi.fn(() => Promise.resolve('16\n'));
    const { shell, pool, dispose } = setup(spawn);
    expect(await shell.run('A', 'getprop ro.build.version.release')).toBe('16\n');
    expect(pool.acquire).toHaveBeenCalledWith('A');
    expect(spawn).toHaveBeenCalledWith('getprop ro.build.version.release');
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('releases the device when the command fails', async () => {
    const { shell, dispose } = setup(() => Promise.reject(new Error('closed')));
    await expect(shell.run('A', 'x')).rejects.toThrow('closed');
    expect(dispose).toHaveBeenCalledOnce();
  });
});
