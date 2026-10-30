import type { AdbServerClient } from '@yume-chan/adb';
import type { Device } from '../../src/devices/types';

export const device = (overrides: Partial<Device> = {}): Device => ({
  id: 'R5CX123',
  platform: 'android',
  kind: 'physical',
  name: 'SM F741B',
  model: 'SM F741B',
  detail: 'b6qxeea',
  state: 'ready',
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
