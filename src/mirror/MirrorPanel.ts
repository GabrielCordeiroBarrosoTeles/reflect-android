import * as vscode from 'vscode';
import { deviceLabel } from '../devices/types';
import type { Device } from '../devices/types';
import { Emitter } from '../core/Emitter';
import { applyMirrorWebview } from './mirrorWebview';
import type { IMirrorSurface } from './types';
import { WebviewBridge } from './WebviewBridge';

export class MirrorPanel implements IMirrorSurface {
  private readonly panel: vscode.WebviewPanel;
  private readonly disposeEmitter = new Emitter<void>();
  private readonly visibilityEmitter = new Emitter<boolean>();

  readonly channel: WebviewBridge;
  readonly onDidDispose = this.disposeEmitter.event;
  readonly onDidChangeVisibility = this.visibilityEmitter.event;

  constructor(device: Device, extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel('reflect.mirror', deviceLabel(device), vscode.ViewColumn.Beside, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
    });
    this.channel = new WebviewBridge(this.panel.webview, device.id);
    applyMirrorWebview(this.panel.webview, extensionUri);
    this.panel.onDidChangeViewState(({ webviewPanel }) => this.visibilityEmitter.fire(webviewPanel.visible));
    this.panel.onDidDispose(() => {
      this.channel.dispose();
      this.disposeEmitter.fire();
      this.disposeEmitter.dispose();
      this.visibilityEmitter.dispose();
    });
  }

  get visible(): boolean {
    return this.panel.visible;
  }

  reveal(): void {
    this.panel.reveal();
  }

  dispose(): void {
    this.panel.dispose();
  }
}
