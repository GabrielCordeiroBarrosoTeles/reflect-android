import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { Emitter } from '../../src/core/Emitter';
import type { PollerState } from '../../src/deviceInfo/DeviceInfoPoller';
import type { InspectedComponent } from '../../src/inspector/types';
import { ComponentTab, displayPath } from '../../src/tools/ComponentTab';
import { DeviceTab } from '../../src/tools/DeviceTab';
import { NetworkTab } from '../../src/tools/NetworkTab';
import { LogsTab, MAX_LOG_LINES } from '../../src/tools/LogsTab';
import { ActionsTab } from '../../src/tools/ActionsTab';
import { MementoLinkHistory } from '../../src/tools/MementoLinkHistory';
import { MAX_POINTS, PerformanceTab } from '../../src/tools/PerformanceTab';
import type { PerformanceReading } from '../../src/performance/types';
import { BATTERY_MODES, STATE_COMMAND } from '../../src/appActions/deviceCommands';
import type { AppAction } from '../../src/appActions/types';
import { ACTIONS_STATE_OUTPUT } from '../appActions/fixtures';
import type { LogRead } from '../../src/logs/types';
import type { NetworkResult } from '../../src/network/types';
import { renderToolsHtml } from '../../src/tools/toolsHtml';
import { TOOLS_VIEW_ID, ToolsViewProvider } from '../../src/tools/ToolsViewProvider';
import { device } from '../fakes/devices';
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
    context.target = device({ id: 'A' });
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
  const actions = { setActive: vi.fn(), run: vi.fn(() => Promise.resolve()), refresh: vi.fn(() => Promise.resolve()), sync: vi.fn() };
  const performance = { setActive: vi.fn(), setPaused: vi.fn(), resetFrames: vi.fn(() => Promise.resolve()), sync: vi.fn() };
  const app = new Emitter<boolean>();
  let connected = false;
  const clipboard = new FakeClipboard();
  const notify = vi.fn();
  const setTabContext = vi.fn();
  const context = new FakeActiveDeviceContext();
  const tabsFor = vi.fn(() => ({ actions: [], tools: ['component', 'device'] as const }));
  const provider = new ToolsViewProvider(Uri.file('/ext') as unknown as vscode.Uri, { app: { get isConnected() { return connected; }, onDidChange: app.event }, clipboard, notify, setTabContext, context, capabilities: tabsFor }, () => ({ component, device, storage, network, logs, actions, performance }));
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
  return { context, tabsFor, provider, view, send, component, device, storage, network, logs, actions, performance, clipboard, notify, setTabContext, setConnected };
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

  it('offers every tab while there is no device and the tabs of the target device otherwise', async () => {
    const { view, send, context, tabsFor } = setupProvider();
    await send({ type: 'ready' });
    expect(view.webview.posted).toContainEqual({ type: 'tabs-available', tabs: ['component', 'network', 'logs', 'storage', 'device', 'performance', 'actions'] });
    const phone = device({ id: 'A' });
    context.setTarget(phone);
    expect(tabsFor).toHaveBeenCalledWith(phone);
    expect(view.webview.posted.at(-1)).toEqual({ type: 'tabs-available', tabs: ['component', 'device'] });
    context.setTarget(undefined);
    expect(view.webview.posted.at(-1)).toEqual({ type: 'tabs-available', tabs: ['component', 'network', 'logs', 'storage', 'device', 'performance', 'actions'] });
  });

  it('stops following the device after dispose', () => {
    const { context, provider, tabsFor } = setupProvider();
    provider.dispose();
    context.setTarget(device());
    expect(tabsFor).not.toHaveBeenCalled();
  });

  it('tells the page when the app connects and drives the network, logs and actions tabs', async () => {
    const { view, send, setConnected, network, logs, actions, performance, provider } = setupProvider();
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
    await send({ type: 'tab-changed', tab: 'actions' });
    await send({ type: 'actions-run', action: { kind: 'restart' } });
    await send({ type: 'actions-run', action: { kind: 'reboot' } });
    await send({ type: 'actions-refresh' });
    expect([actions.setActive.mock.lastCall, actions.run.mock.calls, actions.refresh.mock.calls.length, actions.sync.mock.calls.length]).toEqual([[true], [[{ kind: 'restart' }]], 1, 0]);
    await send({ type: 'tab-changed', tab: 'performance' });
    await send({ type: 'performance-pause', paused: true });
    await send({ type: 'performance-pause', paused: null });
    await send({ type: 'performance-reset' });
    expect([performance.setActive.mock.lastCall, performance.setPaused.mock.calls, performance.resetFrames.mock.calls.length, performance.sync.mock.calls.length]).toEqual([[true], [[true]], 1, 0]);
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
    context.mirroredDevice = device({ id: 'A' });
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
    context.mirroredDevice = device({ id: 'A' });
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

describe('ActionsTab', () => {
  const setupActions = (state = ACTIONS_STATE_OUTPUT, serial = 'A') => {
    const commands: string[] = [];
    const outputs: string[] = [];
    const shell = {
      run: vi.fn((_serial: string, command: string) => {
        commands.push(command);
        return Promise.resolve(command === STATE_COMMAND ? state : (outputs.shift() ?? 'Success'));
      }),
    };
    const context = new FakeActiveDeviceContext();
    context.mirroredDevice = device({ id: serial });
    const channel = new FakeToolsChannel();
    const confirm = vi.fn((_message: string, _action: string) => Promise.resolve(true));
    let links: readonly string[] = [];
    const tab = new ActionsTab({ shell, context, confirm, links: { get: () => links, set: (value) => (links = value) } }, channel);
    return { shell, commands, outputs, context, channel, confirm, tab, links: () => links };
  };

  it('loads the device state when the tab opens', async () => {
    const { tab, channel, shell } = setupActions();
    tab.setActive(false);
    expect(shell.run).not.toHaveBeenCalled();
    tab.setActive(true);
    await flushPromises();
    expect(channel.last('actions-state')?.state).toMatchObject({ kind: 'ready', app: 'br.com.client.hmlqa', links: [], wirelessAdb: false, battery: { level: 26 } });
  });

  it('runs actions, reports the result and reloads the state', async () => {
    const { tab, channel, commands, links } = setupActions();
    await tab.refresh();
    await tab.run({ kind: 'deep-link', url: 'mobilidade://trip/1' });
    await tab.run({ kind: 'deep-link', url: 'mobilidade://trip/2' });
    await tab.run({ kind: 'deep-link', url: 'mobilidade://trip/1' });
    expect(links()).toEqual(['mobilidade://trip/1', 'mobilidade://trip/2']);
    expect(channel.last('actions-result')).toEqual({ type: 'actions-result', ok: true, message: 'Opened mobilidade://trip/1' });
    const results: string[] = [];
    const actions: AppAction[] = [
      { kind: 'restart' },
      { kind: 'app-settings' },
      { kind: 'app-language', locale: 'en-US' },
      { kind: 'app-language', locale: '' },
      { kind: 'permission', permissions: ['android.permission.CAMERA'], granted: false },
      { kind: 'permission', permissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION'], granted: true },
      { kind: 'toggle', setting: 'darkMode', on: true },
      { kind: 'toggle', setting: 'wifi', on: false },
      { kind: 'font-scale', scale: 1.15 },
      ...BATTERY_MODES.map((mode): AppAction => ({ kind: 'battery', mode })),
    ];
    for (const action of actions) {
      await tab.run(action);
      results.push(String(channel.last('actions-result')?.message));
    }
    expect(results).toEqual([
      'Restarted br.com.client.hmlqa',
      'Opened the app settings on the device',
      'App language set to en-US',
      'App language back to the system default',
      'Revoked Camera',
      'Granted Access fine location, Access coarse location',
      'Dark mode on',
      'Wi-Fi off',
      'Font size 1.15×',
      'Battery back to the real state',
      'Battery set to 5%, unplugged',
      'Battery set to 15%, unplugged',
      'Battery set to 50%, charging',
      'Battery set to full',
    ]);
    expect(commands.filter((command) => command === STATE_COMMAND).length).toBeGreaterThan(10);
    for (let index = 0; index < 10; index += 1) await tab.run({ kind: 'deep-link', url: `x://${index}` });
    expect(links()).toHaveLength(8);
  });

  it('keeps Wi-Fi and airplane mode on while connected over Wi-Fi', async () => {
    const { tab, channel, commands } = setupActions(ACTIONS_STATE_OUTPUT, '192.168.1.20:5555');
    await tab.refresh();
    expect(channel.last('actions-state')?.state).toMatchObject({ wirelessAdb: true });
    await tab.run({ kind: 'toggle', setting: 'airplane', on: true });
    expect(channel.last('actions-result')?.ok).toBe(false);
    expect(commands).not.toContain('cmd connectivity airplane-mode enable');
    await tab.run({ kind: 'toggle', setting: 'mobileData', on: false });
    expect(channel.last('actions-result')?.message).toBe('Mobile data off');
  });

  it('asks before clearing data and reports failures', async () => {
    const { tab, channel, confirm, commands, outputs } = setupActions();
    await tab.refresh();
    confirm.mockResolvedValueOnce(false);
    await tab.run({ kind: 'clear-data' });
    expect(commands).not.toContain('pm clear br.com.client.hmlqa');
    await tab.run({ kind: 'clear-data' });
    expect(channel.last('actions-result')?.message).toBe('Cleared the data of br.com.client.hmlqa');
    expect(confirm).toHaveBeenCalledWith('Clear all data of br.com.client.hmlqa? The app goes back to its first launch.', 'Clear Data');
    outputs.push('Error: Activity not started, unable to resolve Intent');
    await tab.run({ kind: 'deep-link', url: 'nothing://here' });
    expect(channel.last('actions-result')).toEqual({ type: 'actions-result', ok: false, message: 'Error: Activity not started, unable to resolve Intent' });
    await tab.run({ kind: 'deep-link', url: 'bad link' });
    expect(channel.last('actions-result')?.message).toBe('Enter a link like myapp://screen or https://example.com/page.');
  });

  it('handles a missing device, a missing app and shell failures', async () => {
    const { tab, channel, context, shell } = setupActions('@@app \n');
    await tab.refresh();
    await tab.run({ kind: 'restart' });
    expect(channel.last('actions-result')?.message).toBe('This action needs an app in the foreground.');
    shell.run.mockRejectedValueOnce(new Error('adb gone')).mockRejectedValueOnce('device offline');
    await tab.refresh();
    expect(channel.last('actions-state')?.state).toEqual({ kind: 'failed', message: 'adb gone' });
    await tab.run({ kind: 'toggle', setting: 'darkMode', on: true });
    expect(channel.last('actions-result')).toEqual({ type: 'actions-result', ok: false, message: 'Error: device offline' });
    context.mirroredDevice = undefined;
    await tab.refresh();
    await tab.run({ kind: 'toggle', setting: 'darkMode', on: true });
    expect([channel.last('actions-state')?.state, channel.last('actions-result')?.message]).toEqual([{ kind: 'idle' }, 'Open a device first.']);
    tab.sync();
    expect(channel.posted.at(-1)).toEqual({ type: 'actions-state', state: { kind: 'idle' } });
  });
});

describe('MementoLinkHistory', () => {
  it('stores recent links in the memento and ignores corrupted values', () => {
    const values = new Map<string, unknown>();
    const memento = { get: <T>(key: string, fallback: T): T => (values.has(key) ? (values.get(key) as T) : fallback), update: (key: string, value: unknown) => (values.set(key, value), Promise.resolve()) };
    const history = new MementoLinkHistory(memento, 'links');
    expect(history.get()).toEqual([]);
    history.set(['a://1', 'b://2']);
    expect(history.get()).toEqual(['a://1', 'b://2']);
    values.set('links', ['ok://1', 5]);
    expect(history.get()).toEqual(['ok://1']);
    values.set('links', 'broken');
    expect(history.get()).toEqual([]);
  });
});

describe('PerformanceTab', () => {
  const reading = (overrides: Partial<PerformanceReading> = {}): PerformanceReading => ({
    app: 'com.app',
    pid: 7,
    cpu: 12.5,
    memoryKb: 51558,
    frames: { total: 1000, janky: 100, p50: 9, p90: 17, p99: 41 },
    ...overrides,
  });

  const setupPerformance = () => {
    vi.useFakeTimers();
    let clock = 0;
    const readings: (PerformanceReading | Error)[] = [];
    const reader = {
      read: vi.fn((_serial: string) => {
        const next = readings.shift() ?? reading();
        return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
      }),
      resetFrames: vi.fn((_serial: string, _app: string) => Promise.resolve()),
    };
    const context = new FakeActiveDeviceContext();
    context.mirroredDevice = device({ id: 'A' });
    const channel = new FakeToolsChannel();
    const tab = new PerformanceTab(reader, context, channel, 2000, () => (clock += 2000));
    const points = () => channel.posted.filter((message) => message.type === 'performance-points' && !message.reset).flatMap((message) => (message.type === 'performance-points' ? message.points : []));
    return { reader, context, channel, tab, readings, points };
  };

  it('samples only while active and derives frames per second and jank between samples', async () => {
    const { reader, channel, tab, readings, points } = setupPerformance();
    readings.push(reading(), reading({ frames: { total: 1120, janky: 106, p50: 9, p90: 18, p99: 40 } }), reading({ frames: { total: 1120, janky: 106, p50: 9, p90: 18, p99: 40 } }), reading({ frames: undefined, memoryKb: undefined, cpu: undefined }));
    tab.setActive(true);
    tab.setActive(true);
    for (let index = 0; index < 4; index += 1) await vi.advanceTimersByTimeAsync(index === 0 ? 0 : 2000);
    expect(channel.posted.find((message) => message.type === 'performance-status')).toEqual({ type: 'performance-status', status: { kind: 'sampling', app: 'com.app' } });
    expect(points().map(({ cpu, memoryMb, fps, jank, p90 }) => [cpu, memoryMb, fps, jank, p90])).toEqual([
      [12.5, 50.3, undefined, undefined, 17],
      [12.5, 50.3, 60, 5, 18],
      [12.5, 50.3, 0, 0, 18],
      [undefined, undefined, undefined, undefined, undefined],
    ]);
    tab.setActive(false);
    const calls = reader.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reader.read).toHaveBeenCalledTimes(calls);
    tab.sync();
    expect(channel.last('performance-points')).toMatchObject({ reset: true, points: { length: 4 } });
    tab.dispose();
    vi.useRealTimers();
  });

  it('starts over for another app, a restarted process, a reset or another device', async () => {
    const { tab, readings, points, reader, context, channel } = setupPerformance();
    readings.push(reading(), reading({ pid: 8, frames: { total: 50, janky: 1, p50: 9, p90: 17, p99: 41 } }), reading({ app: 'com.other' }), reading({ app: 'com.other', frames: { total: 1200, janky: 100, p50: 9, p90: 17, p99: 41 } }));
    tab.setActive(true);
    for (let index = 0; index < 4; index += 1) await vi.advanceTimersByTimeAsync(index === 0 ? 0 : 2000);
    expect(points().map(({ fps }) => fps)).toEqual([undefined, undefined, undefined, 100]);
    await tab.resetFrames();
    expect(reader.resetFrames).toHaveBeenCalledWith('A', 'com.other');
    readings.push(reading({ app: 'com.other', frames: { total: 10, janky: 0, p50: 9, p90: 17, p99: 41 } }));
    await vi.advanceTimersByTimeAsync(2000);
    expect(points().at(-1)?.fps).toBeUndefined();
    reader.resetFrames.mockRejectedValueOnce(new Error('x'));
    await tab.resetFrames();
    context.setMirroredDevice(undefined);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.posted.slice(-2)).toEqual([
      { type: 'performance-points', points: [], reset: true },
      { type: 'performance-status', status: { kind: 'idle' } },
    ]);
    await tab.resetFrames();
    expect(reader.resetFrames).toHaveBeenCalledTimes(2);
    tab.dispose();
    vi.useRealTimers();
  });

  it('reports a missing app and failures, pauses and keeps at most 60 points', async () => {
    const { reader, channel, tab, readings } = setupPerformance();
    readings.push(reading({ app: undefined, pid: undefined }), new Error('adb gone'), 'plain' as unknown as Error);
    reader.read.mockImplementationOnce(() => Promise.resolve(reading({ app: undefined, pid: undefined }))).mockRejectedValueOnce(new Error('adb gone')).mockRejectedValueOnce('plain');
    tab.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(channel.last('performance-status')?.status).toEqual({ kind: 'no-app' });
    await tab.resetFrames();
    expect(reader.resetFrames).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(channel.last('performance-status')?.status).toEqual({ kind: 'failed', message: 'adb gone' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(channel.last('performance-status')?.status).toEqual({ kind: 'failed', message: 'plain' });
    for (let index = 0; index < 65; index += 1) await vi.advanceTimersByTimeAsync(2000);
    tab.sync();
    expect(channel.last('performance-points')?.points).toHaveLength(MAX_POINTS);
    tab.setPaused(true);
    expect(channel.last('performance-status')?.status).toEqual({ kind: 'paused' });
    const calls = reader.read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reader.read).toHaveBeenCalledTimes(calls);
    tab.dispose();
    vi.useRealTimers();
  });

  it('drops readings that arrive after it stopped', async () => {
    let resolve: (value: PerformanceReading) => void = () => undefined;
    const { reader, tab, points } = setupPerformance();
    reader.read.mockReturnValueOnce(new Promise<PerformanceReading>((done) => (resolve = done)));
    tab.setActive(true);
    tab.setActive(false);
    resolve(reading());
    await vi.advanceTimersByTimeAsync(0);
    expect(points()).toEqual([]);
    tab.dispose();
    vi.useRealTimers();
  });

  it('uses the real clock by default', () => {
    const tab = new PerformanceTab({ read: vi.fn(), resetFrames: vi.fn() }, new FakeActiveDeviceContext(), new FakeToolsChannel(), 2000);
    tab.dispose();
    expect(tab).toBeInstanceOf(PerformanceTab);
  });
});
