import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { WebviewBridge } from '../../src/mirror/WebviewBridge';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/shared/protocol';
import { FakeWebview } from '../mocks/vscode';

const asWebview = (webview: FakeWebview) => webview as unknown as vscode.Webview;

describe('WebviewBridge', () => {
  it('posts host messages to the webview', () => {
    const webview = new FakeWebview();
    const bridge = new WebviewBridge(asWebview(webview), 'R5CX123');
    const message: HostToWebviewMessage = { type: 'session-state', state: 'connecting', deviceName: 'Pixel' };
    bridge.post(message);
    expect(webview.posted).toEqual([{ deviceId: 'R5CX123', message }]);
  });

  it('emits messages received from the webview', () => {
    const webview = new FakeWebview();
    const bridge = new WebviewBridge(asWebview(webview), 'R5CX123');
    const listener = vi.fn();
    bridge.onMessage(listener);
    const message: WebviewToHostMessage = { type: 'text', text: 'hi' };
    webview.received.fire({ deviceId: 'R5CX123', message });
    expect(listener).toHaveBeenCalledWith(message);
  });

  it('stamps the device id it is retargeted to', () => {
    const webview = new FakeWebview();
    const bridge = new WebviewBridge(asWebview(webview), undefined);
    bridge.post({ type: 'idle' });
    bridge.deviceId = 'B';
    bridge.post({ type: 'idle' });
    expect(webview.posted).toEqual([
      { deviceId: undefined, message: { type: 'idle' } },
      { deviceId: 'B', message: { type: 'idle' } },
    ]);
  });

  it('stops listening after dispose', () => {
    const webview = new FakeWebview();
    const bridge = new WebviewBridge(asWebview(webview), 'R5CX123');
    const listener = vi.fn();
    bridge.onMessage(listener);
    bridge.dispose();
    webview.received.fire({ deviceId: 'R5CX123', message: { type: 'ready' } });
    expect(listener).not.toHaveBeenCalled();
  });
});
