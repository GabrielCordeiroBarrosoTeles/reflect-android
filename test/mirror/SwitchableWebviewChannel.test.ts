import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { SwitchableWebviewChannel } from '../../src/mirror/SwitchableWebviewChannel';
import type { WebviewToHostMessage } from '../../src/shared/protocol';
import { FakeWebview } from '../mocks/vscode';

const from = (message: WebviewToHostMessage) => ({ deviceId: undefined, message });
const asWebview = (webview: FakeWebview) => webview as unknown as vscode.Webview;

describe('SwitchableWebviewChannel', () => {
  it('drops posts while no webview is attached', () => {
    const channel = new SwitchableWebviewChannel();
    expect(() => channel.post({ type: 'idle' })).not.toThrow();
  });

  it('posts to and listens on the attached webview', () => {
    const channel = new SwitchableWebviewChannel();
    const webview = new FakeWebview();
    const listener = vi.fn();
    channel.onMessage(listener);
    channel.attach(asWebview(webview));
    channel.post({ type: 'idle' });
    webview.received.fire(from({ type: 'ready' }));
    expect(webview.posted).toEqual([{ deviceId: undefined, message: { type: 'idle' } }]);
    expect(listener).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('stamps posts with the current device id, including on a webview attached later', () => {
    const channel = new SwitchableWebviewChannel();
    const first = new FakeWebview();
    const second = new FakeWebview();
    channel.setDeviceId('A');
    channel.attach(asWebview(first));
    channel.post({ type: 'idle' });
    channel.setDeviceId(undefined);
    channel.post({ type: 'idle' });
    channel.setDeviceId('B');
    channel.attach(asWebview(second));
    channel.post({ type: 'idle' });
    expect(first.posted).toEqual([
      { deviceId: 'A', message: { type: 'idle' } },
      { deviceId: undefined, message: { type: 'idle' } },
    ]);
    expect(second.posted).toEqual([{ deviceId: 'B', message: { type: 'idle' } }]);
  });

  it('keeps its listeners when the webview is replaced', () => {
    const channel = new SwitchableWebviewChannel();
    const first = new FakeWebview();
    const second = new FakeWebview();
    const listener = vi.fn();
    channel.onMessage(listener);
    channel.attach(asWebview(first));
    channel.attach(asWebview(second));
    first.received.fire(from({ type: 'ready' }));
    second.received.fire(from({ type: 'resync' }));
    channel.post({ type: 'idle' });
    expect(listener.mock.calls).toEqual([[{ type: 'resync' }]]);
    expect(first.posted).toEqual([]);
    expect(second.posted).toEqual([{ deviceId: undefined, message: { type: 'idle' } }]);
  });

  it('stops everything on detach and dispose', () => {
    const channel = new SwitchableWebviewChannel();
    const webview = new FakeWebview();
    const listener = vi.fn();
    channel.onMessage(listener);
    channel.attach(asWebview(webview));
    channel.detach();
    webview.received.fire(from({ type: 'ready' }));
    channel.dispose();
    expect(listener).not.toHaveBeenCalled();
  });
});
