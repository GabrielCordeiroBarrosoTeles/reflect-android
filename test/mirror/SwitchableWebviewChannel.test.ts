import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { SwitchableWebviewChannel } from '../../src/mirror/SwitchableWebviewChannel';
import { FakeWebview } from '../mocks/vscode';

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
    webview.received.fire({ type: 'ready' });
    expect(webview.posted).toEqual([{ type: 'idle' }]);
    expect(listener).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('keeps its listeners when the webview is replaced', () => {
    const channel = new SwitchableWebviewChannel();
    const first = new FakeWebview();
    const second = new FakeWebview();
    const listener = vi.fn();
    channel.onMessage(listener);
    channel.attach(asWebview(first));
    channel.attach(asWebview(second));
    first.received.fire({ type: 'ready' });
    second.received.fire({ type: 'resync' });
    channel.post({ type: 'idle' });
    expect(listener.mock.calls).toEqual([[{ type: 'resync' }]]);
    expect(first.posted).toEqual([]);
    expect(second.posted).toEqual([{ type: 'idle' }]);
  });

  it('stops everything on detach and dispose', () => {
    const channel = new SwitchableWebviewChannel();
    const webview = new FakeWebview();
    const listener = vi.fn();
    channel.onMessage(listener);
    channel.attach(asWebview(webview));
    channel.detach();
    webview.received.fire({ type: 'ready' });
    channel.dispose();
    expect(listener).not.toHaveBeenCalled();
  });
});
