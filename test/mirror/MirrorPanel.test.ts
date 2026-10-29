import { describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MirrorPanel } from '../../src/mirror/MirrorPanel';
import { device } from '../fakes/devices';
import { window } from '../mocks/vscode';

const createPanel = () => {
  const panel = new MirrorPanel(device({ name: 'Pixel 8', model: 'Pixel 8' }), vscode.Uri.file('/ext'));
  return { panel, fake: window.panels[0]! };
};

describe('MirrorPanel', () => {
  it('opens a scripted webview beside the editor restricted to dist', () => {
    const { fake } = createPanel();
    expect(fake.viewType).toBe('reflect.mirror');
    expect(fake.title).toBe('Pixel 8');
    expect(fake.column).toBe(vscode.ViewColumn.Beside);
    expect(fake.options).toEqual({ enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(vscode.Uri.file('/ext'), 'dist')] });
    expect(fake.webview.html).toContain('webview:/ext/dist/webview.js');
  });

  it('exposes and reports visibility', () => {
    const { panel, fake } = createPanel();
    const changes: boolean[] = [];
    panel.onDidChangeVisibility((visible) => changes.push(visible));
    fake.setVisible(false);
    fake.setVisible(true);
    expect(changes).toEqual([false, true]);
    expect(panel.visible).toBe(true);
  });

  it('reveals the panel', () => {
    const { panel, fake } = createPanel();
    panel.reveal();
    expect(fake.revealed).toBe(1);
  });

  it('notifies once and detaches the channel when the panel closes', () => {
    const { panel, fake } = createPanel();
    const closed = vi.fn();
    const messages = vi.fn();
    panel.onDidDispose(closed);
    panel.channel.onMessage(messages);
    panel.dispose();
    fake.webview.received.fire({ type: 'ready' });
    expect(closed).toHaveBeenCalledOnce();
    expect(messages).not.toHaveBeenCalled();
  });
});
