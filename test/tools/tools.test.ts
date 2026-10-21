import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { Emitter } from '../../src/core/Emitter';
import type { PollerState } from '../../src/deviceInfo/DeviceInfoPoller';
import type { InspectedComponent } from '../../src/inspector/types';
import { ComponentTab, displayPath } from '../../src/tools/ComponentTab';
import { DeviceTab } from '../../src/tools/DeviceTab';
import { NetworkTab } from '../../src/tools/NetworkTab';
import { LogsTab, MAX_LOG_LINES } from '../../src/tools/LogsTab';
import type { LogRead } from '../../src/logs/types';
import type { NetworkResult } from '../../src/network/types';
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
  const network = { setActive: vi.fn(), setPaused: vi.fn(), clear: vi.fn(() => Promise.resolve()), sync: vi.fn() };
  const logs = { setActive: vi.fn(), setPaused: vi.fn(), clear: vi.fn(), sync: vi.fn() };
  const app = new Emitter<boolean>();
  let connected = false;
  const clipboard = new FakeClipboard();
  const notify = vi.fn();
  const setTabContext = vi.fn();
  const provider = new ToolsViewProvider(Uri.file('/ext') as unknown as vscode.Uri, { app: { get isConnected() { return connected; }, onDidChange: app.event }, clipboard, notify, setTabContext }, () => ({ component, device, storage, network, logs }));
  const view = new FakeWebviewView();
  provider.resolveWebviewView(view as unknown as vscode.WebviewView);
  const send = async (message: unknown) => {
    view.webview.received.fire(message);
    await flushPromises();
  };
  const setConnected = (value: boolean) => {
    connected = value;
    app.fire(value);
  };
  return { provider, view, send, component, device, storage, network, logs, clipboard, notify, setTabContext, setConnected };
};

describe('ToolsViewProvider', () => {
  it('serves the tools page and syncs every tab when ready', async () => {
    const { view, send, component, device, storage, network } = setupProvider();
    expect(view.webview.options).toEqual({ enableScripts: true, localResourceRoots: [Uri.file('/ext/dist')] });
    expect(view.webview.html).toContain('webview:/ext/dist/tools.js');
    await send({ type: 'ready' });
    expect([component.sync, device.sync, storage.sync, network.sync].map((fn) => fn.mock.calls.length)).toEqual([1, 1, 1, 1]);
    expect(view.webview.posted[0]).toEqual({ type: 'app-available', available: false });
  });

  it('tells the page when the app connects and drives the network and logs tabs', async () => {
    const { view, send, setConnected, network, logs, provider } = setupProvider();
    setConnected(true);
    expect(view.webview.posted.at(-1)).toEqual({ type: 'app-available', available: true });
    await send({ type: 'tab-changed', tab: 'network' });
    expect(network.setActive).toHaveBeenLastCalledWith(true);
    await send({ type: 'network-pause', paused: true });
    await send({ type: 'network-pause', paused: 'yes' });
    await send({ type: 'network-clear' });
    expect([network.setPaused.mock.calls, network.clear.mock.calls.length]).toEqual([[[true]], 1]);
    await send({ type: 'tab-changed', tab: 'logs' });
    await send({ type: 'logs-pause', paused: false });
    await send({ type: 'logs-pause', paused: 1 });
    await send({ type: 'logs-clear' });
    expect([logs.setActive.mock.lastCall, network.setActive.mock.lastCall, logs.setPaused.mock.calls, logs.clear.mock.calls.length, logs.sync.mock.calls.length]).toEqual([[true], [false], [[false]], 1, 0]);
    provider.dispose();
    setConnected(false);
    expect(view.webview.posted.at(-1)).toEqual({ type: 'app-available', available: true });
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

describe('NetworkTab', () => {
  const entry = (id: number, url = `https://a/${id}`) => ({
    id,
    method: 'GET',
    url,
    state: 'done' as const,
    status: 200,
    startedAt: 0,
    duration: 5,
    requestHeaders: {},
    requestBody: { text: '', truncated: false },
    responseHeaders: {},
    responseBody: { text: 'ok', truncated: false },
    responseSize: 2,
  });

  const setupNetwork = () => {
    vi.useFakeTimers();
    const results: NetworkResult[] = [];
    const reader = {
      read: vi.fn((_device: unknown, _since: number) => Promise.resolve(results.shift() ?? ({ status: 'ok', revision: 2, entries: [] } as NetworkResult))),
      clear: vi.fn(() => Promise.resolve()),
    };
    const context = new FakeActiveDeviceContext();
    context.mirroredDevice = deviceInfo({ serial: 'A' });
    const channel = new FakeToolsChannel();
    const tab = new NetworkTab(reader, context, channel, 1000);
    return { reader, context, channel, tab, results };
  };

  it('polls only while active, sends new entries and keeps the latest revision', async () => {
    const { reader, channel, tab, results } = setupNetwork();
    results.push({ status: 'ok', revision: 2, entries: [entry(1), entry(2)] }, { status: 'ok', revision: 2, entries: [] }, { status: 'ok', revision: 3, entries: [{ ...entry(2), status: 404 }] });
    tab.setActive(true);
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.posted).toEqual([
      { type: 'network-status', status: { kind: 'capturing' } },
      { type: 'network-entries', entries: [entry(1), entry(2)], reset: false },
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reader.read.mock.calls.map(([, since]) => since)).toEqual([0, 2, 2]);
    expect(channel.last('network-entries')).toEqual({ type: 'network-entries', entries: [{ ...entry(2), status: 404 }], reset: false });
    tab.setActive(false);
    const calls = reader.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(reader.read).toHaveBeenCalledTimes(calls);
    tab.sync();
    expect(channel.posted.slice(-2)).toEqual([
      { type: 'network-status', status: { kind: 'capturing' } },
      { type: 'network-entries', entries: [entry(1), { ...entry(2), status: 404 }], reset: true },
    ]);
    tab.dispose();
    vi.useRealTimers();
  });

  it('resends everything when the app reloads and resets when the device changes', async () => {
    const { channel, tab, results, context } = setupNetwork();
    results.push({ status: 'ok', revision: 5, entries: [entry(1)] }, { status: 'ok', revision: 1, entries: [entry(1, 'https://b/1')] });
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('network-entries')).toEqual({ type: 'network-entries', entries: [entry(1, 'https://b/1')], reset: true });
    context.setMirroredDevice(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.posted.slice(-2)).toEqual([
      { type: 'network-entries', entries: [], reset: true },
      { type: 'network-status', status: { kind: 'idle' } },
    ]);
    tab.dispose();
    vi.useRealTimers();
  });

  it('pauses, clears and reports problems', async () => {
    const { reader, channel, tab, results, context } = setupNetwork();
    results.push({ status: 'unavailable' }, { status: 'error', message: 'boom' });
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.last('network-status')).toEqual({ type: 'network-status', status: { kind: 'unavailable' } });
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('network-status')).toEqual({ type: 'network-status', status: { kind: 'failed', message: 'boom' } });
    reader.read.mockRejectedValueOnce(new Error('metro down')).mockRejectedValueOnce('plain');
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('network-status')?.status).toEqual({ kind: 'failed', message: 'metro down' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('network-status')?.status).toEqual({ kind: 'failed', message: 'plain' });
    tab.setPaused(true);
    expect(channel.last('network-status')?.status).toEqual({ kind: 'paused' });
    const calls = reader.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(reader.read).toHaveBeenCalledTimes(calls);
    tab.setPaused(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(reader.read).toHaveBeenCalledTimes(calls + 1);
    await tab.clear();
    expect(reader.clear).toHaveBeenCalledOnce();
    reader.clear.mockRejectedValueOnce(new Error('x'));
    await tab.clear();
    context.mirroredDevice = undefined;
    await tab.clear();
    expect(reader.clear).toHaveBeenCalledTimes(2);
    tab.dispose();
    vi.useRealTimers();
  });

  it('drops answers that arrive after it stopped', async () => {
    let resolve: (result: NetworkResult) => void = () => undefined;
    const { reader, channel, tab } = setupNetwork();
    reader.read.mockReturnValueOnce(new Promise<NetworkResult>((done) => (resolve = done)));
    tab.setActive(true);
    tab.setActive(false);
    resolve({ status: 'ok', revision: 1, entries: [entry(1)] });
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.last('network-entries')).toBeUndefined();
    tab.dispose();
    vi.useRealTimers();
  });
});

describe('LogsTab', () => {
  const line = (time: string, message: string, tid = 1): LogRead['lines'][number] => ({ time, pid: 7, tid, level: 'I', tag: 'ReactNativeJS', message });

  const setupLogs = () => {
    vi.useFakeTimers();
    const reads: (LogRead | Error)[] = [];
    const reader = {
      read: vi.fn((_serial: string, _since: string | undefined) => {
        const next = reads.shift() ?? { app: 'com.app', pid: 7, lines: [] };
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      }),
    };
    const context = new FakeActiveDeviceContext();
    context.mirroredDevice = deviceInfo({ serial: 'A' });
    const channel = new FakeToolsChannel();
    const tab = new LogsTab(reader, context, channel, 1000);
    return { reader, context, channel, tab, reads };
  };

  it('reads new lines once a second only while active, without repeating lines at the same timestamp', async () => {
    const { reader, channel, tab, reads } = setupLogs();
    reads.push(
      { app: 'com.app', pid: 7, lines: [line('10-21 09:00:00.000', 'a'), line('10-21 09:00:01.000', 'b')] },
      { app: 'com.app', pid: 7, lines: [line('10-21 09:00:01.000', 'b'), line('10-21 09:00:01.000', 'c', 2)] },
      { app: 'com.app', pid: 7, lines: [line('10-21 09:00:01.000', 'b')] },
    );
    tab.setActive(true);
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.posted[0]).toEqual({ type: 'logs-status', status: { kind: 'capturing', app: 'com.app' } });
    expect(channel.last('logs-lines')?.lines.map((entry) => [entry.id, entry.message])).toEqual([[1, 'a'], [2, 'b']]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('logs-lines')?.lines.map((entry) => entry.message)).toEqual(['c']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(reader.read.mock.calls.map(([, since]) => since)).toEqual([undefined, '10-21 09:00:01.000', '10-21 09:00:01.000']);
    expect(channel.posted.filter((message) => message.type === 'logs-lines')).toHaveLength(2);
    tab.setActive(false);
    const calls = reader.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(reader.read).toHaveBeenCalledTimes(calls);
    tab.sync();
    expect(channel.last('logs-lines')).toMatchObject({ reset: true, lines: [{ message: 'a' }, { message: 'b' }, { message: 'c' }] });
    tab.dispose();
    vi.useRealTimers();
  });

  it('starts over when the app restarts or the device changes, and keeps the newest lines', async () => {
    const { channel, tab, reads, context } = setupLogs();
    reads.push(
      { app: 'com.app', pid: 7, lines: Array.from({ length: MAX_LOG_LINES + 10 }, (_, index) => line('10-21 09:00:00.000', `m${index}`, index)) },
      { app: 'com.app', pid: 8, lines: [line('10-21 09:01:00.000', 'fresh')] },
    );
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    tab.sync();
    expect(channel.last('logs-lines')?.lines).toHaveLength(MAX_LOG_LINES);
    await vi.advanceTimersByTimeAsync(1000);
    tab.sync();
    expect(channel.last('logs-lines')?.lines.map((entry) => entry.message)).toEqual(['fresh']);
    context.setMirroredDevice(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.posted.slice(-2)).toEqual([
      { type: 'logs-lines', lines: [], reset: true },
      { type: 'logs-status', status: { kind: 'idle' } },
    ]);
    tab.dispose();
    vi.useRealTimers();
  });

  it('reports a missing app and failures, pauses and clears', async () => {
    const { reader, channel, tab, reads } = setupLogs();
    reads.push({ app: undefined, pid: undefined, lines: [] }, { app: 'com.app', pid: undefined, lines: [] }, new Error('adb gone'), 'plain' as unknown as Error);
    reader.read.mockImplementationOnce(() => Promise.resolve({ app: undefined, pid: undefined, lines: [] }));
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.last('logs-status')?.status).toEqual({ kind: 'no-app' });
    reader.read.mockRejectedValueOnce(new Error('adb gone')).mockRejectedValueOnce('plain');
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('logs-status')?.status).toEqual({ kind: 'failed', message: 'adb gone' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.last('logs-status')?.status).toEqual({ kind: 'failed', message: 'plain' });
    tab.setPaused(true);
    expect(channel.last('logs-status')?.status).toEqual({ kind: 'paused' });
    const calls = reader.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(reader.read).toHaveBeenCalledTimes(calls);
    tab.setPaused(false);
    tab.clear();
    expect(channel.last('logs-lines')).toEqual({ type: 'logs-lines', lines: [], reset: true });
    tab.dispose();
    vi.useRealTimers();
  });

  it('drops answers that arrive after it stopped', async () => {
    let resolve: (read: LogRead) => void = () => undefined;
    const { reader, channel, tab } = setupLogs();
    reader.read.mockReturnValueOnce(new Promise<LogRead>((done) => (resolve = done)));
    tab.setActive(true);
    tab.setActive(false);
    resolve({ app: 'com.app', pid: 7, lines: [line('10-21 09:00:00.000', 'late')] });
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.last('logs-lines')).toBeUndefined();
    tab.dispose();
    vi.useRealTimers();
  });
});
