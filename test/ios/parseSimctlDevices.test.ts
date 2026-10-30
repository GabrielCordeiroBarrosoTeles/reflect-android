import { describe, expect, it } from 'vitest';
import { parseSimctlDevices } from '../../src/ios/parseSimctlDevices';
import { IPHONE_15_BOOTED_UDID, IPHONE_15_OLD_UDID, simctlDevicesJson } from './fixtures';

describe('parseSimctlDevices', () => {
  it('maps a booted iPhone 15 to a ready simulator with its runtime label', () => {
    expect(parseSimctlDevices(simctlDevicesJson())[0]).toEqual({
      id: IPHONE_15_BOOTED_UDID,
      platform: 'ios',
      kind: 'simulator',
      name: 'iPhone 15',
      model: 'iPhone 15',
      detail: 'iOS 26.5',
      state: 'ready',
    });
  });

  it('ignores non-iOS runtimes and unavailable devices', () => {
    const names = parseSimctlDevices(simctlDevicesJson()).map((device) => device.name);
    expect(names).not.toContain('Apple Watch');
    expect(names).not.toContain('iPhone Broken');
  });

  it('keeps two devices with the same name on different runtimes distinct', () => {
    const iphones = parseSimctlDevices(simctlDevicesJson()).filter((device) => device.name === 'iPhone 15');
    expect(iphones.map((device) => [device.id, device.detail])).toEqual([
      [IPHONE_15_BOOTED_UDID, 'iOS 26.5'],
      [IPHONE_15_OLD_UDID, 'iOS 17.5'],
    ]);
  });

  it('orders ready devices first, then by name, and maps other states to shutdown', () => {
    const devices = parseSimctlDevices(simctlDevicesJson());
    expect(devices.map((device) => [device.name, device.state])).toEqual([
      ['iPhone 15', 'ready'],
      ['iPad Air', 'shutdown'],
      ['iPhone 15', 'shutdown'],
    ]);
  });
});

describe('parseSimctlDevices tolerance', () => {
  const ios = 'com.apple.CoreSimulator.SimRuntime.iOS-18-0';

  it('keeps valid devices when other entries and runtimes are malformed', () => {
    const json = JSON.stringify({
      devices: {
        [ios]: [null, 'x', { udid: 1, name: 'a', isAvailable: true }, { udid: 'u', isAvailable: true }, { udid: 'ok', name: 'Good', isAvailable: true, state: 'Booted' }],
        'com.apple.CoreSimulator.SimRuntime.iOS-17-0': 'nope',
      },
    });
    expect(parseSimctlDevices(json).map((device) => device.id)).toEqual(['ok']);
  });

  it('accepts the availability string variant', () => {
    const json = JSON.stringify({ devices: { [ios]: [{ udid: 'a', name: 'A', availability: '(available)' }, { udid: 'b', name: 'B', availability: '(unavailable)' }] } });
    expect(parseSimctlDevices(json).map((device) => device.id)).toEqual(['a']);
  });

  it('returns nothing when devices is missing or the root is not an object, and throws on bad JSON', () => {
    expect(parseSimctlDevices('{}')).toEqual([]);
    expect(parseSimctlDevices('[]')).toEqual([]);
    expect(parseSimctlDevices('{"devices":[]}')).toEqual([]);
    expect(() => parseSimctlDevices('not json')).toThrow();
  });
});
