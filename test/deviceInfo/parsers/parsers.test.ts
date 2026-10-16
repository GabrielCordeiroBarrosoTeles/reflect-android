import { describe, expect, it } from 'vitest';
import { parseBattery } from '../../../src/deviceInfo/parsers/battery';
import { parseDisplay } from '../../../src/deviceInfo/parsers/display';
import { parseForeground } from '../../../src/deviceInfo/parsers/foreground';
import { parseMemory } from '../../../src/deviceInfo/parsers/memory';
import { parseNetwork } from '../../../src/deviceInfo/parsers/network';
import { parseProps } from '../../../src/deviceInfo/parsers/props';
import { parseStorage } from '../../../src/deviceInfo/parsers/storage';

describe('parseProps', () => {
  it('reads the getprop lines in order', () => {
    expect(parseProps('samsung\nSM-F741B\n16\n36\narm64-v8a')).toEqual({
      manufacturer: 'samsung',
      model: 'SM-F741B',
      androidVersion: '16',
      sdk: '36',
      abi: 'arm64-v8a',
    });
  });

  it('fills missing lines with empty strings', () => {
    expect(parseProps('')).toEqual({ manufacturer: '', model: '', androidVersion: '', sdk: '', abi: '' });
  });
});

describe('parseBattery', () => {
  it.each([
    ['2', 'charging'],
    ['3', 'discharging'],
    ['4', 'notCharging'],
    ['5', 'full'],
    ['1', 'unknown'],
  ])('maps status %s to %s', (status, expected) => {
    expect(parseBattery(`level: 50\nstatus: ${status}`)?.status).toBe(expected);
  });

  it('computes level, temperature and power source', () => {
    expect(parseBattery('AC powered: false\nUSB powered: true\nlevel: 79\nscale: 100\ntemperature: 350\nstatus: 4')).toEqual({
      levelPercent: 79,
      status: 'notCharging',
      temperatureCelsius: 35,
      powerSource: 'usb',
    });
  });

  it('defaults scale, temperature, status and power source', () => {
    expect(parseBattery('level: 40')).toEqual({ levelPercent: 40, status: 'unknown', temperatureCelsius: 0, powerSource: 'battery' });
  });

  it('detects wireless charging and custom scales', () => {
    expect(parseBattery('Wireless powered: true\nlevel: 5\nscale: 10')).toMatchObject({ levelPercent: 50, powerSource: 'wireless' });
  });

  it('returns undefined without a level', () => {
    expect(parseBattery('status: 2')).toBeUndefined();
  });
});

describe('parseMemory', () => {
  it('reads total and available memory in kB', () => {
    expect(parseMemory('MemTotal:       11381404 kB\nMemAvailable:    3838600 kB')).toEqual({ totalKb: 11381404, availableKb: 3838600 });
  });

  it.each(['MemTotal: 10 kB', 'MemAvailable: 5 kB', ''])('returns undefined for incomplete data %j', (text) => {
    expect(parseMemory(text)).toBeUndefined();
  });
});

describe('parseStorage', () => {
  it('reads the last df line', () => {
    expect(parseStorage('Filesystem 1K-blocks Used Available\n/dev/block/dm-65 232924364 164195964  68597328  71% /data')).toEqual({
      totalKb: 232924364,
      availableKb: 68597328,
    });
  });

  it.each(['', 'garbage', '/dev 100'])('returns undefined for %j', (text) => {
    expect(parseStorage(text)).toBeUndefined();
  });
});

describe('parseDisplay', () => {
  it('prefers override values over physical ones', () => {
    expect(parseDisplay('Physical size: 1080x2640\nOverride size: 720x1760\nPhysical density: 480\nOverride density: 320')).toEqual({
      resolution: '720x1760',
      density: 320,
    });
  });

  it('falls back to physical values and handles missing data', () => {
    expect(parseDisplay('Physical size: 1080x2640\nPhysical density: 480')).toEqual({ resolution: '1080x2640', density: 480 });
    expect(parseDisplay('')).toEqual({ resolution: undefined, density: undefined });
  });
});

describe('parseNetwork', () => {
  it('reads the Wi-Fi address and airplane mode', () => {
    expect(parseNetwork('    inet 192.168.1.38/24 brd 192.168.1.255 scope global wlan0\n0')).toEqual({ ipAddress: '192.168.1.38', airplaneMode: false });
    expect(parseNetwork('1')).toEqual({ ipAddress: undefined, airplaneMode: true });
  });
});

describe('parseForeground', () => {
  it('reads the resumed package', () => {
    expect(parseForeground('topResumedActivity=ActivityRecord{205002072 u0 host.exp.exponent/.experience.ExperienceActivity t6855}')).toBe(
      'host.exp.exponent',
    );
    expect(parseForeground('')).toBeUndefined();
  });
});
