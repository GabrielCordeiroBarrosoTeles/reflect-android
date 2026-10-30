import type * as vscode from 'vscode';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { HostToWebviewMessage, MirrorEnvelope, WebviewToHostMessage } from '../shared/protocol';
import type { IWebviewChannel } from './types';

export class WebviewBridge implements IWebviewChannel, IDisposable {
  private readonly messageEmitter = new Emitter<WebviewToHostMessage>();
  private readonly subscription: vscode.Disposable;

  readonly onMessage = this.messageEmitter.event;

  constructor(
    private readonly webview: vscode.Webview,
    public deviceId: string | undefined,
  ) {
    this.subscription = webview.onDidReceiveMessage((envelope: MirrorEnvelope<WebviewToHostMessage>) =>
      this.messageEmitter.fire(envelope.message),
    );
  }

  post(message: HostToWebviewMessage): void {
    const envelope: MirrorEnvelope<HostToWebviewMessage> = { deviceId: this.deviceId, message };
    void this.webview.postMessage(envelope);
  }

  dispose(): void {
    this.subscription.dispose();
    this.messageEmitter.dispose();
  }
}
