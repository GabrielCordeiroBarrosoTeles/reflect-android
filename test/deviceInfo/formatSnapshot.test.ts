import { describe, expect, it } from 'vitest';
import { formatBytes, formatSnapshot as formatWithOptions, maskIpAddress } from '../../src/deviceInfo/formatSnapshot';
import type { DeviceSnapshot } from '../../src/deviceInfo/types';

const snapshot: DeviceSnapshot = {
  props: { manufacturer: 'samsung', model: 'SM-F741B', androidVersion: '16', sdk: '36', abi: 'arm64-v8a' },
  battery: { levelPercent: 79, status: 'notCharging', temperatureCelsius: 34.9, powerSource: 'usb' },
  memory: { totalKb: 11381404, availableKb: 3838600 },
  storage: { totalKb: 232924364, availableKb: 68597328 },
  display: { resolution: '1080x2640', density: 480 },
  network: { ipAddress: '192.168.1.38', airplaneMode: false },
  foregroundPackage: 'host.exp.exponent',
};

const formatSnapshot = (value: DeviceSnapshot) => formatWithOptions(value, { maskIpAddress: false });

const values = (groups: ReturnType<typeof formatSnapshot>) =>
  Object.fromEntries(groups.flatMap((group) => group.entries.map((entry) => [`${group.label}.${entry.label}`, entry.value])));

describe('formatBytes', () => {
  it('uses GB above one gigabyte and MB below', () => {
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 GB');
    expect(formatBytes(1024 * 300)).toBe('300 MB');
  });
});

describe('formatSnapshot', () => {
  it('groups readable values', () => {
    const groups = formatSnapshot(snapshot);
    expect(groups.map((group) => [group.label, group.icon])).toEqual([
      ['Device', 'device-mobile'],
      ['Battery', 'zap'],
      ['Resources', 'pulse'],
      ['Network', 'globe'],
      ['App', 'package'],
    ]);
    expect(values(groups)).toEqual({
      'Device.Model': 'samsung SM-F741B',
      'Device.Android': '16 (API 36)',
      'Device.Display': '1080x2640 · 480 dpi',
      'Device.CPU': 'arm64-v8a',
      'Battery.Level': '79%',
      'Battery.Status': 'Not charging',
      'Battery.Power source': 'USB',
      'Battery.Temperature': '34.9 °C',
      'Resources.Memory': '7.2 GB used of 10.9 GB (3.7 GB free)',
      'Resources.Storage': '156.7 GB used of 222.1 GB (65.4 GB free)',
      'Network.Wi-Fi IP': '192.168.1.38',
      'Network.Airplane mode': 'Off',
      'App.Foreground': 'host.exp.exponent',
    });
  });

  it.each([
    ['charging', 'Charging', 'ac', 'AC'],
    ['discharging', 'Discharging', 'battery', 'Battery'],
    ['full', 'Full', 'wireless', 'Wireless'],
    ['unknown', 'Unknown', 'usb', 'USB'],
  ] as const)('labels %s batteries powered by %s', (status, statusLabel, powerSource, sourceLabel) => {
    const result = values(formatSnapshot({ ...snapshot, battery: { ...snapshot.battery!, status, powerSource } }));
    expect(result['Battery.Status']).toBe(statusLabel);
    expect(result['Battery.Power source']).toBe(sourceLabel);
  });

  it('masks the IP address in privacy mode', () => {
    expect(maskIpAddress('192.168.1.38')).toBe('192.168.1.•••');
    expect(values(formatWithOptions(snapshot, { maskIpAddress: true }))['Network.Wi-Fi IP']).toBe('192.168.1.•••');
  });

  it('marks missing data as unavailable', () => {
    const result = values(
      formatSnapshot({
        ...snapshot,
        battery: undefined,
        memory: undefined,
        storage: undefined,
        display: { resolution: undefined, density: undefined },
        network: { ipAddress: undefined, airplaneMode: true },
        foregroundPackage: undefined,
        props: { ...snapshot.props, manufacturer: '' },
      }),
    );
    expect(result).toMatchObject({
      'Device.Model': 'SM-F741B',
      'Device.Display': 'Unavailable',
      'Battery.Battery': 'Unavailable',
      'Resources.Memory': 'Unavailable',
      'Resources.Storage': 'Unavailable',
      'Network.Wi-Fi IP': 'Not connected',
      'Network.Airplane mode': 'On',
      'App.Foreground': 'Unavailable',
    });
  });
});
