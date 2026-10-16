import { describe, expect, it, vi } from 'vitest';
import { DEVICE_INFO_COMMAND, DeviceInfoCollector } from '../../src/deviceInfo/DeviceInfoCollector';
import { REAL_OUTPUT } from './fixtures';

describe('DeviceInfoCollector', () => {
  it('runs one shell command and parses every section', async () => {
    const run = vi.fn(() => Promise.resolve(REAL_OUTPUT));
    const snapshot = await new DeviceInfoCollector({ run }).collect('A');
    expect(run).toHaveBeenCalledWith('A', DEVICE_INFO_COMMAND);
    expect(snapshot).toEqual({
      props: { manufacturer: 'samsung', model: 'SM-F741B', androidVersion: '16', sdk: '36', abi: 'arm64-v8a' },
      battery: { levelPercent: 79, status: 'notCharging', temperatureCelsius: 35, powerSource: 'usb' },
      memory: { totalKb: 11381404, availableKb: 3838600 },
      storage: { totalKb: 232924364, availableKb: 68597328 },
      display: { resolution: '1080x2640', density: 480 },
      network: { ipAddress: '192.168.1.38', airplaneMode: false },
      foregroundPackage: 'host.exp.exponent',
    });
  });

  it('tolerates missing sections', async () => {
    const snapshot = await new DeviceInfoCollector({ run: () => Promise.resolve('') }).collect('A');
    expect(snapshot.battery).toBeUndefined();
    expect(snapshot.props.model).toBe('');
  });

  it('keeps the command free of interactive or slow parts', () => {
    expect(DEVICE_INFO_COMMAND).toContain('echo @@foreground');
    expect(DEVICE_INFO_COMMAND).not.toContain('logcat');
  });
});
