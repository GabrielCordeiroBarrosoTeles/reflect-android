import * as vscode from 'vscode';
import { deviceLabel } from '../devices/types';
import type { Device } from '../devices/types';
import type { IDevicePicker } from '../adb/types';

interface DeviceQuickPickItem extends vscode.QuickPickItem {
  readonly device: Device;
}

const ICONS: Readonly<Record<Device['kind'], string>> = {
  physical: '$(device-mobile)',
  emulator: '$(vm)',
  simulator: '$(device-mobile)',
};

export class QuickPickDevicePicker implements IDevicePicker {
  async pick(devices: readonly Device[]): Promise<Device | undefined> {
    const [first] = devices;
    if (devices.length === 1) {
      return first;
    }
    const items = devices.map<DeviceQuickPickItem>((device) => ({
      label: `${ICONS[device.kind]} ${deviceLabel(device)}`,
      description: device.kind === 'simulator' ? 'iOS Simulator' : device.id,
      detail: device.detail,
      device,
    }));
    const selected = await vscode.window.showQuickPick(items, {
      title: 'Reflect: Select a device',
      placeHolder: 'Choose the device to mirror',
    });
    return selected?.device;
  }
}
