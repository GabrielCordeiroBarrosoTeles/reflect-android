import * as vscode from 'vscode';
import { deviceLabel } from '../devices/types';
import type { Device } from '../devices/types';
import type { IDevicePicker } from '../adb/types';

interface DeviceQuickPickItem extends vscode.QuickPickItem {
  readonly device: Device;
}

export class QuickPickDevicePicker implements IDevicePicker {
  async pick(devices: readonly Device[]): Promise<Device | undefined> {
    const [first] = devices;
    if (devices.length === 1) {
      return first;
    }
    const items = devices.map<DeviceQuickPickItem>((device) => ({
      label: `$(device-mobile) ${deviceLabel(device)}`,
      description: device.id,
      detail: device.detail,
      device,
    }));
    const selected = await vscode.window.showQuickPick(items, {
      title: 'Reflect: Select a device',
      placeHolder: 'Choose the Android device to mirror',
    });
    return selected?.device;
  }
}
