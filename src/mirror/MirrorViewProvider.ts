import * as vscode from 'vscode';
import type { Device, IDeviceDiscovery } from '../devices/types';
import { CommandIds } from '../commands/commandIds';
import { Emitter } from '../core/Emitter';
import type { Event, IDisposable } from '../core/types';
import type { DeviceListItem, WebviewToHostMessage } from '../shared/protocol';
import { applyMirrorWebview, mirrorWebviewOptions } from './mirrorWebview';
import { SidebarSurface } from './SidebarSurface';
import { SwitchableWebviewChannel } from './SwitchableWebviewChannel';
import type { IMirrorSurface } from './types';

export const MIRROR_VIEW_ID = 'reflect.deviceView';

export interface SimulatorWindowState {
  readonly hidden: boolean;
  readonly onDidChangeHidden: Event<boolean>;
}

const toListItem = ({ id, name, detail, platform, kind, state }: Device): DeviceListItem => ({ id, name, detail, platform, kind, state });

export class MirrorViewProvider implements vscode.WebviewViewProvider, IDisposable {
  private readonly visibilityEmitter = new Emitter<boolean>();
  private readonly subscriptions: IDisposable[];
  private view: vscode.WebviewView | undefined;
  private viewSubscriptions: vscode.Disposable[] = [];
  private owner: SidebarSurface | undefined;

  readonly channel = new SwitchableWebviewChannel();
  readonly onDidChangeVisibility = this.visibilityEmitter.event;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly discovery: Pick<IDeviceDiscovery, 'devices' | 'onDidChangeDevices'>,
    private readonly simulatorWindow: SimulatorWindowState,
  ) {
    this.subscriptions = [
      this.channel.onMessage((message) => this.handleMessage(message)),
      discovery.onDidChangeDevices(() => this.postDeviceList()),
      simulatorWindow.onDidChangeHidden(() => this.postSimulatorHidden()),
    ];
  }

  get visible(): boolean {
    return this.view?.visible ?? false;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.releaseView();
    this.view = view;
    view.webview.options = mirrorWebviewOptions(this.extensionUri);
    this.channel.attach(view.webview);
    applyMirrorWebview(view.webview, this.extensionUri);
    this.viewSubscriptions = [
      view.onDidChangeVisibility(() => this.visibilityEmitter.fire(view.visible)),
      view.onDidDispose(() => {
        this.releaseView();
        this.visibilityEmitter.fire(false);
      }),
    ];
  }

  reveal(): void {
    void vscode.commands.executeCommand(`${MIRROR_VIEW_ID}.focus`);
  }

  claim(device: Device): IMirrorSurface {
    const previous = this.owner;
    const surface = new SidebarSurface(this, () => this.release(surface));
    this.owner = surface;
    this.channel.setDeviceId(device.id);
    previous?.dispose();
    return surface;
  }

  dispose(): void {
    this.owner?.dispose();
    this.releaseView();
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.channel.dispose();
    this.visibilityEmitter.dispose();
  }

  private release(surface: SidebarSurface): void {
    if (this.owner !== surface) {
      return;
    }
    this.owner = undefined;
    this.channel.setDeviceId(undefined);
    this.postIdleScreen();
  }

  private postIdleScreen(): void {
    this.channel.post({ type: 'idle' });
    this.postDeviceList();
    this.postSimulatorHidden();
  }

  private postDeviceList(): void {
    if (!this.owner) {
      this.channel.post({ type: 'device-list', devices: this.discovery.devices.map(toListItem) });
    }
  }

  private postSimulatorHidden(): void {
    if (!this.owner) {
      this.channel.post({ type: 'simulator-hidden', hidden: this.simulatorWindow.hidden });
    }
  }

  private releaseView(): void {
    for (const subscription of this.viewSubscriptions) {
      subscription.dispose();
    }
    this.viewSubscriptions = [];
    this.view = undefined;
    this.channel.detach();
  }

  private handleMessage(message: WebviewToHostMessage): void {
    if (message.type === 'open-device') {
      void vscode.commands.executeCommand(CommandIds.openDevice, ...(message.deviceId === undefined ? [] : [message.deviceId]));
      return;
    }
    if (message.type === 'boot-device') {
      void vscode.commands.executeCommand(CommandIds.bootSimulator, message.deviceId);
      return;
    }
    if (message.type === 'show-in-simulator') {
      void vscode.commands.executeCommand(CommandIds.showInSimulator);
      return;
    }
    if (message.type === 'ready' && !this.owner) {
      this.postIdleScreen();
    }
  }
}
