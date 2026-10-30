// Trimmed from `xcrun simctl list devices -j` on the owner's machine, plus synthetic entries.
const SIM = 'com.apple.CoreSimulator.SimRuntime';

export const IPHONE_15_BOOTED_UDID = 'BDAE45E9-4A82-4ECD-B08E-0201F95AA7CB';
export const IPHONE_15_OLD_UDID = '11111111-2222-3333-4444-555555555555';

export const simctlDevicesJson = (state: 'Booted' | 'Shutdown' = 'Booted'): string =>
  JSON.stringify({
    devices: {
      [`${SIM}.iOS-26-5`]: [
        { udid: IPHONE_15_BOOTED_UDID, isAvailable: true, state, name: 'iPhone 15' },
        { udid: '99999999-0000-0000-0000-000000000001', isAvailable: true, state: 'Shutdown', name: 'iPad Air' },
        { udid: '99999999-0000-0000-0000-000000000002', isAvailable: false, state: 'Shutdown', name: 'iPhone Broken' },
      ],
      [`${SIM}.iOS-17-5`]: [{ udid: IPHONE_15_OLD_UDID, isAvailable: true, state: 'Shutdown', name: 'iPhone 15' }],
      [`${SIM}.watchOS-11-0`]: [{ udid: '99999999-0000-0000-0000-000000000003', isAvailable: true, state: 'Booted', name: 'Apple Watch' }],
    },
  });
