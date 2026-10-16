import * as vscode from 'vscode';
import { deviceLabel } from '../adb/toDeviceInfo';
import type { DeviceInfo, IDevicePicker } from '../adb/types';

interface DeviceQuickPickItem extends vscode.QuickPickItem {
  readonly device: DeviceInfo;
}

export class QuickPickDevicePicker implements IDevicePicker {
  async pick(devices: readonly DeviceInfo[]): Promise<DeviceInfo | undefined> {
    const [first] = devices;
    if (devices.length === 1) {
      return first;
    }
    const items = devices.map<DeviceQuickPickItem>((device) => ({
      label: `$(device-mobile) ${deviceLabel(device)}`,
      description: device.serial,
      detail: device.product,
      device,
    }));
    const selected = await vscode.window.showQuickPick(items, {
      title: 'Reflect: Select a device',
      placeHolder: 'Choose the Android device to mirror',
    });
    return selected?.device;
  }
}
