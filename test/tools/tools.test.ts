import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { Emitter } from '../../src/core/Emitter';
import type { PollerState } from '../../src/deviceInfo/DeviceInfoPoller';
import type { InspectedComponent } from '../../src/inspector/types';
import { ComponentTab, displayPath } from '../../src/tools/ComponentTab';
import { DeviceTab } from '../../src/tools/DeviceTab';
import { renderToolsHtml } from '../../src/tools/toolsHtml';
import { TOOLS_VIEW_ID, ToolsViewProvider } from '../../src/tools/ToolsViewProvider';
import { deviceInfo } from '../fakes/devices';
import { FakeActiveDeviceContext } from '../fakes/FakeActiveDeviceContext';
import { FakeClipboard } from '../fakes/FakeClipboard';
import { FakeToolsChannel } from '../fakes/FakeToolsChannel';
import { flushPromises } from '../fakes/PushStream';
import { commands, FakeWebviewView, Uri } from '../mocks/vscode';

const component: InspectedComponent = {
  name: 'Text',
  props: [{ name: 'children', value: '"Copy"' }],
  owners: ['Text', 'Demo'],
  source: { file: '/workspace/src/Demo.tsx', line: 3, column: 1 },
};

describe('ComponentTab', () => {
  it('shortens paths outside the workspace', () => {
    expect(displayPath('/workspace/src/Demo.tsx')).toBe('src/Demo.tsx');
    expect(displayPath('/elsewhere/app/src/Demo.tsx')).toBe('…/app/src/Demo.tsx');
    expect(displayPath('/x/Demo.tsx')).toBe('/x/Demo.tsx');
  });

  it('sends the inspected component, reveals itself and opens sources', async () => {
    const channel = new FakeToolsChannel();
    const openSource = vi.fn(() => Promise.resolve());
    const tab = new ComponentTab(channel, openSource);
    tab.sync();
    tab.show(component);
    tab.show({ ...component, source: undefined });
    tab.reveal();
    await tab.open({ file: '/a.tsx', line: 1, column: 1 });
    expect(channel.posted).toEqual([
      { type: 'component', view: undefined },
      { type: 'component', view: { name: 'Text', source: component.source, location: 'src/Demo.tsx:3', props: component.props, owners: ['Text', 'Demo'] } },
      { type: 'component', view: { name: 'Text', source: undefined, location: undefined, props: component.props, owners: ['Text', 'Demo'] } },
    ]);
    expect(channel.reveal).toHaveBeenCalledWith('component');
    expect(openSource).toHaveBeenCalledWith({ file: '/a.tsx', line: 1, column: 1 });
  });
});

describe('DeviceTab', () => {
  it('follows the target device, polls only while active and formats snapshots', () => {
    const states = new Emitter<PollerState>();
    const poller = { onDidChangeState: states.event, setTarget: vi.fn(), setVisible: vi.fn(), refresh: vi.fn() };
    const context = new FakeActiveDeviceContext();
    context.target = deviceInfo({ serial: 'A' });
    const channel = new FakeToolsChannel();
    const tab = new DeviceTab(poller, context, () => ({ maskIpAddress: true }), channel);
    expect(poller.setTarget).toHaveBeenCalledWith('A');
    context.setTarget(undefined);
    expect(poller.setTarget).toHaveBeenLastCalledWith(undefined);
    tab.setActive(true);
    tab.refresh();
    expect([poller.setVisible.mock.calls, poller.refresh.mock.calls.length]).toEqual([[[true]], 1]);
    tab.sync();
    states.fire({ kind: 'failed', error: new Error('x') });
    states.fire({
      kind: 'loaded',
      snapshot: {
        props: { manufacturer: 'samsung', model: 'SM-F741B', androidVersion: '16', sdk: '36', abi: 'arm64-v8a' },
        battery: undefined,
        memory: undefined,
        storage: undefined,
        display: { resolution: undefined, density: undefined },
        network: { ipAddress: '192.168.1.20', airplaneMode: false },
        foregroundPackage: undefined,
      },
    });
    expect(channel.posted.slice(0, 2)).toEqual([
      { type: 'device', state: { kind: 'idle' } },
      { type: 'device', state: { kind: 'failed' } },
    ]);
    const loaded = channel.last('device')?.state;
    expect(loaded?.kind === 'loaded' && loaded.groups[0]?.label).toBe('Device');
    expect(JSON.stringify(loaded)).not.toContain('192.168.1.20');
    tab.dispose();
  });
});

describe('tools html', () => {
  it('renders the tabs, hides Storage until an app connects and locks scripts to a nonce', () => {
    const html = renderToolsHtml({ cspSource: 'vscode-resource:', scriptUri: 'tools.js', styleUri: 'tools.css' });
    expect(html).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+'/);
    expect(html).toContain("img-src https: http: data:;");
    expect(html).toContain('title="Storage" aria-label="Storage" hidden>');
    expect(html).toContain('codicon-device-mobile');
  });
});

const setupProvider = () => {
  const component = { open: vi.fn(() => Promise.resolve()), sync: vi.fn() };
  const device = { setActive: vi.fn(), refresh: vi.fn(), sync: vi.fn() };
  const storage = { refresh: vi.fn(() => Promise.resolve()), write: vi.fn(() => Promise.resolve()), remove: vi.fn(() => Promise.resolve()), sync: vi.fn() };
  const clipboard = new FakeClipboard();
  const notify = vi.fn();
  const setTabContext = vi.fn();
  const provider = new ToolsViewProvider(Uri.file('/ext') as unknown as vscode.Uri, { clipboard, notify, setTabContext }, () => ({ component, device, storage }));
  const view = new FakeWebviewView();
  provider.resolveWebviewView(view as unknown as vscode.WebviewView);
  const send = async (message: unknown) => {
    view.webview.received.fire(message);
    await flushPromises();
  };
  return { provider, view, send, component, device, storage, clipboard, notify, setTabContext };
};

describe('ToolsViewProvider', () => {
  it('serves the tools page and syncs every tab when ready', async () => {
    const { view, send, component, device, storage } = setupProvider();
    expect(view.webview.options).toEqual({ enableScripts: true, localResourceRoots: [Uri.file('/ext/dist')] });
    expect(view.webview.html).toContain('webview:/ext/dist/tools.js');
    await send({ type: 'ready' });
    expect([component.sync, device.sync, storage.sync].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1]);
  });

  it('tracks the active tab, polls the device only while its tab is visible and refreshes storage when opened', async () => {
    const { send, device, storage, setTabContext, provider, view } = setupProvider();
    await send({ type: 'tab-changed', tab: 'device' });
    expect(setTabContext).toHaveBeenLastCalledWith('device');
    expect(device.setActive).toHaveBeenLastCalledWith(true);
    expect([provider.isActive('device'), provider.isActive('storage')]).toEqual([true, false]);
    view.setVisible(false);
    expect(device.setActive).toHaveBeenLastCalledWith(false);
    view.setVisible(true);
    await send({ type: 'tab-changed', tab: 'storage' });
    expect(device.setActive).toHaveBeenLastCalledWith(false);
    expect(storage.refresh).toHaveBeenCalledOnce();
    view.dispose();
    expect(provider.isActive('storage')).toBe(false);
  });

  it('routes actions to the tabs and copies text', async () => {
    const { send, component, device, storage, clipboard, notify } = setupProvider();
    const source = { file: '/a.tsx', line: 1, column: 2 };
    await send({ type: 'open-source', source });
    await send({ type: 'device-refresh' });
    await send({ type: 'storage-refresh' });
    await send({ type: 'storage-save', key: 'a', value: '1' });
    await send({ type: 'storage-create', key: 'b', value: '2' });
    await send({ type: 'storage-delete', key: 'a' });
    await send({ type: 'copy', text: 'short' });
    await send({ type: 'copy', text: 'x'.repeat(50) });
    expect(component.open).toHaveBeenCalledWith(source);
    expect(device.refresh).toHaveBeenCalledOnce();
    expect(storage.refresh).toHaveBeenCalledOnce();
    expect(storage.write.mock.calls).toEqual([['a', '1', false], ['b', '2', true]]);
    expect(storage.remove).toHaveBeenCalledWith('a');
    expect(clipboard.text).toHaveLength(50);
    expect(notify.mock.calls).toEqual([['Copied "short"'], [`Copied "${'x'.repeat(39)}…"`]]);
  });

  it('ignores malformed messages', async () => {
    const { send, component, storage, setTabContext, clipboard } = setupProvider();
    for (const message of [null, 'x', { type: 'nope' }, { type: 'tab-changed', tab: 'settings' }, { type: 'copy' }, { type: 'open-source', source: { file: 'a', line: '1', column: 1 } }, { type: 'open-source' }, { type: 'storage-save', key: 'a' }, { type: 'storage-create', value: 'x' }, { type: 'storage-delete', key: 3 }, { type: 'toString' }]) {
      await send(message);
    }
    expect([component.open, storage.write, storage.remove, setTabContext].map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0, 0]);
    expect(clipboard.text).toBe('');
  });

  it('reveals a tab by focusing the view and selecting it', async () => {
    const { provider, view, setTabContext } = setupProvider();
    await provider.reveal('component');
    expect(commands.executeCommand).toHaveBeenCalledWith(`${TOOLS_VIEW_ID}.focus`);
    expect(view.webview.posted.at(-1)).toEqual({ type: 'select-tab', tab: 'component' });
    expect(setTabContext).toHaveBeenLastCalledWith('component');
    provider.dispose();
    provider.post({ type: 'select-tab', tab: 'device' });
    expect(view.webview.posted.at(-1)).toEqual({ type: 'select-tab', tab: 'component' });
  });
});
