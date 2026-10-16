import type { AdbServerClient } from '@yume-chan/adb';
import type { DeviceInfo } from './types';

export const toDeviceInfo = (device: AdbServerClient.Device): DeviceInfo => ({
  serial: device.serial,
  state: device.state,
  model: device.model?.replace(/_/g, ' '),
  product: device.product,
  transportId: device.transportId,
});

export const deviceLabel = (device: DeviceInfo): string => device.model ?? device.serial;
