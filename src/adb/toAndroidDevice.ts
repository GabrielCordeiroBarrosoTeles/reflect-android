import type { AdbServerClient } from '@yume-chan/adb';
import type { Device, DeviceState } from '../devices/types';

const STATES: Readonly<Record<AdbServerClient.ConnectionState, DeviceState>> = {
  device: 'ready',
  unauthorized: 'unauthorized',
  offline: 'offline',
};

export const toAndroidDevice = (device: AdbServerClient.Device): Device => {
  const model = device.model?.replace(/_/g, ' ');
  return {
    id: device.serial,
    platform: 'android',
    kind: device.serial.startsWith('emulator-') ? 'emulator' : 'physical',
    name: model ?? device.serial,
    model,
    detail: device.product,
    state: STATES[device.state],
  };
};
