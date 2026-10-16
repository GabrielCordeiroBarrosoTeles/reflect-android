import * as vscode from 'vscode';
import type { IActiveDeviceContext } from '../device/types';
import { DisposableStore } from '../core/Disposable';
import type { IDisposable } from '../core/types';
import type { DeviceInfoPoller } from './DeviceInfoPoller';
import { DeviceInfoTreeProvider } from './DeviceInfoTreeProvider';
import type { FormatOptions } from './types';

export const DEVICE_INFO_VIEW_ID = 'reflect.deviceInfo';

export class DeviceInfoView implements IDisposable {
  private readonly store = new DisposableStore();
  private readonly provider: DeviceInfoTreeProvider;

  constructor(
    private readonly poller: DeviceInfoPoller,
    private readonly context: IActiveDeviceContext,
    readOptions: () => FormatOptions,
  ) {
    this.provider = new DeviceInfoTreeProvider(readOptions);
    const view = vscode.window.createTreeView(DEVICE_INFO_VIEW_ID, { treeDataProvider: this.provider });
    this.store.add(view);
    this.store.add(this.provider);
    this.store.add(poller.onDidChangeState((state) => this.provider.update(state)));
    this.store.add(view.onDidChangeVisibility(({ visible }) => poller.setVisible(visible)));
    this.store.add(context.onDidChange(() => this.syncTarget()));
    poller.setVisible(view.visible);
    this.syncTarget();
  }

  refresh(): void {
    this.poller.refresh();
  }

  dispose(): void {
    this.store.dispose();
  }

  private syncTarget(): void {
    this.poller.setTarget(this.context.target?.serial);
  }
}
