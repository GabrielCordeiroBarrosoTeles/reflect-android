import type * as vscode from 'vscode';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import type { IWebviewChannel } from './types';
import { WebviewBridge } from './WebviewBridge';

export class SwitchableWebviewChannel implements IWebviewChannel, IDisposable {
  private readonly messageEmitter = new Emitter<WebviewToHostMessage>();
  private deviceId: string | undefined;
  private attached: { readonly bridge: WebviewBridge; readonly subscription: IDisposable } | undefined;

  readonly onMessage = this.messageEmitter.event;

  attach(webview: vscode.Webview): void {
    this.detach();
    const bridge = new WebviewBridge(webview, this.deviceId);
    this.attached = { bridge, subscription: bridge.onMessage((message) => this.messageEmitter.fire(message)) };
  }

  setDeviceId(deviceId: string | undefined): void {
    this.deviceId = deviceId;
    if (this.attached) {
      this.attached.bridge.deviceId = deviceId;
    }
  }

  detach(): void {
    this.attached?.subscription.dispose();
    this.attached?.bridge.dispose();
    this.attached = undefined;
  }

  post(message: HostToWebviewMessage): void {
    this.attached?.bridge.post(message);
  }

  dispose(): void {
    this.detach();
    this.messageEmitter.dispose();
  }
}
