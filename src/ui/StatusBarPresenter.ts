import * as vscode from 'vscode';
import { deviceLabel } from '../adb/toDeviceInfo';
import type { IActiveDeviceContext } from '../device/types';
import { DisposableStore } from '../core/Disposable';
import type { IDisposable } from '../core/types';
import type { StatusBarView } from './types';

export class StatusBarPresenter implements IDisposable {
  private readonly item: vscode.StatusBarItem;
  private readonly subscriptions = new DisposableStore();
  constructor(
    private readonly context: IActiveDeviceContext,
    commandId: string,
  ) {
    this.item = vscode.window.createStatusBarItem('reflect.device', vscode.StatusBarAlignment.Left, 100);
    this.item.name = 'Reflect for Android';
    this.item.command = commandId;
    this.subscriptions.add(this.context.onDidChange(() => this.render()));
    this.render();
    this.item.show();
  }

  dispose(): void {
    this.subscriptions.dispose();
    this.item.dispose();
  }

  private render(): void {
    const view = this.computeView();
    this.item.text = view.text;
    this.item.tooltip = view.tooltip;
  }

  private computeView(): StatusBarView {
    const ready = this.context.devices.filter((device) => device.state === 'device');
    const active = this.context.mirroredDevice;
    if (active) {
      const label = deviceLabel(active);
      const isConnected = ready.some((device) => device.serial === active.serial);
      return isConnected
        ? { text: `$(device-mobile) ${label}`, tooltip: `Reflect: ${label} connected — click to open` }
        : { text: `$(debug-disconnect) ${label}`, tooltip: `Reflect: ${label} disconnected` };
    }
    const [first] = ready;
    if (!first) {
      return { text: '$(device-mobile) No device', tooltip: 'Reflect: connect an Android device via USB' };
    }
    const text = ready.length === 1 ? deviceLabel(first) : `${ready.length} devices`;
    return { text: `$(device-mobile) ${text}`, tooltip: 'Reflect: click to open device' };
  }
}
