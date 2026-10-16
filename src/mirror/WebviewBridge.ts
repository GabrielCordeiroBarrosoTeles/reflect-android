import type * as vscode from 'vscode';
import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';
import type { IWebviewChannel } from './types';

export class WebviewBridge implements IWebviewChannel, IDisposable {
  private readonly messageEmitter = new Emitter<WebviewToHostMessage>();
  private readonly subscription: vscode.Disposable;

  readonly onMessage = this.messageEmitter.event;

  constructor(private readonly webview: vscode.Webview) {
    this.subscription = webview.onDidReceiveMessage((message: WebviewToHostMessage) =>
      this.messageEmitter.fire(message),
    );
  }

  post(message: HostToWebviewMessage): void {
    void this.webview.postMessage(message);
  }

  dispose(): void {
    this.subscription.dispose();
    this.messageEmitter.dispose();
  }
}
