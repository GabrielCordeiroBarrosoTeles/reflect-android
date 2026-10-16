import type { AdbServerClient } from '@yume-chan/adb';
import type { DeviceInfo } from '../../src/adb/types';

export const deviceInfo = (overrides: Partial<DeviceInfo> = {}): DeviceInfo => ({
  serial: 'R5CX123',
  state: 'device',
  model: 'SM F741B',
  product: 'b6qxeea',
  transportId: 1n,
  ...overrides,
});

export const tangoDevice = (overrides: Partial<AdbServerClient.Device> = {}): AdbServerClient.Device => ({
  serial: 'R5CX123',
  state: 'device',
  authenticating: false,
  model: 'SM_F741B',
  product: 'b6qxeea',
  device: 'b6q',
  transportId: 1n,
  ...overrides,
});
