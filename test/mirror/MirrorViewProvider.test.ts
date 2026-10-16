import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MIRROR_VIEW_ID, MirrorViewProvider } from '../../src/mirror/MirrorViewProvider';
import { FakeWebviewView, commands } from '../mocks/vscode';

const setup = () => {
  const provider = new MirrorViewProvider(vscode.Uri.file('/ext'));
  const view = new FakeWebviewView();
  const resolve = (target = view) => provider.resolveWebviewView(target as unknown as vscode.WebviewView);
  return { provider, view, resolve };
};

describe('MirrorViewProvider', () => {
  it('uses the contributed view id', () => {
    expect(MIRROR_VIEW_ID).toBe('reflect.deviceView');
  });

  it('renders the mirror page when the view resolves', () => {
    const { view, resolve, provider } = setup();
    expect(provider.visible).toBe(false);
    resolve();
    expect(view.webview.options).toEqual({ enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(vscode.Uri.file('/ext'), 'dist')] });
    expect(view.webview.html).toContain('webview:/ext/dist/webview.js');
    expect(provider.visible).toBe(true);
  });

  it('shows the idle screen when the webview is ready without a device', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire({ type: 'ready' });
    expect(view.webview.posted).toEqual([{ type: 'idle' }]);
  });

  it('lets the claimed device own the webview', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const surface = provider.claim();
    const messages = vi.fn();
    surface.channel.onMessage(messages);
    view.webview.received.fire({ type: 'ready' });
    expect(view.webview.posted).toEqual([]);
    expect(messages).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('runs the open device command from the idle screen', () => {
    const { view, resolve } = setup();
    resolve();
    view.webview.received.fire({ type: 'open-device' });
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice');
  });

  it('reveals the view through its focus command', () => {
    setup().provider.reveal();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.deviceView.focus');
  });

  it('reports visibility changes and treats a disposed view as hidden', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const changes: boolean[] = [];
    provider.onDidChangeVisibility((visible) => changes.push(visible));
    view.setVisible(false);
    view.dispose();
    expect(changes).toEqual([false, false]);
    expect(provider.visible).toBe(false);
  });

  it('switches to a new webview when the view resolves again', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const next = new FakeWebviewView();
    resolve(next);
    const changes: boolean[] = [];
    provider.onDidChangeVisibility((visible) => changes.push(visible));
    view.setVisible(false);
    provider.channel.post({ type: 'idle' });
    expect(changes).toEqual([]);
    expect(next.webview.posted).toEqual([{ type: 'idle' }]);
  });

  it('releases the previous owner when a new device claims the sidebar', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const first = provider.claim();
    const closed = vi.fn();
    first.onDidDispose(closed);
    provider.claim();
    expect(closed).toHaveBeenCalledOnce();
    expect(view.webview.posted).toEqual([]);
  });

  it('returns to the idle screen when the owner releases the sidebar', () => {
    const { view, resolve, provider } = setup();
    resolve();
    provider.claim().dispose();
    view.webview.received.fire({ type: 'ready' });
    expect(view.webview.posted).toEqual([{ type: 'idle' }, { type: 'idle' }]);
  });

  it('releases the owner and the view on dispose', () => {
    const { view, resolve, provider } = setup();
    resolve();
    const surface = provider.claim();
    const closed = vi.fn();
    surface.onDidDispose(closed);
    provider.dispose();
    view.webview.received.fire({ type: 'open-device' });
    expect(closed).toHaveBeenCalledOnce();
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});
