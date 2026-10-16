import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createFakeAdb, createTempRoot } from './adb/locator/fs';
import { FakeScrcpyClient } from './fakes/FakeScrcpyClient';
import { flushPromises } from './fakes/PushStream';
import { FakeDeviceObserver } from './fakes/FakeDeviceObserver';
import { tangoDevice } from './fakes/devices';
import { FakeWebviewView, commands, window, workspace } from './mocks/vscode';

const io = vi.hoisted(() => ({
  reachable: [] as boolean[],
  observer: undefined as unknown,
  trackFailure: undefined as Error | undefined,
  execFile: vi.fn((_file: string, _args: string[], _options: unknown, callback: (error: Error | null) => void) => callback(null)),
  scrcpyClient: undefined as unknown,
  startFailure: undefined as Error | undefined,
}));

vi.mock('node:child_process', () => ({ execFile: io.execFile }));

const cdp = vi.hoisted(() => ({
  handle: undefined as ((request: { id: number; method: string; params: { expression?: string } }, emit: (message: unknown) => void) => unknown) | undefined,
}));

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events');
  class FakeWebSocket extends EventEmitter {
    constructor() {
      super();
      queueMicrotask(() => this.emit('open'));
    }
    send(data: string) {
      const request = JSON.parse(data);
      const emit = (message: unknown) => queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify(message))));
      const result = cdp.handle?.(request, emit) ?? {};
      emit({ id: request.id, result });
    }
    close() {
      this.emit('close');
    }
    terminate() {
      this.emit('close');
    }
  }
  return { default: FakeWebSocket };
});

vi.mock('@yume-chan/adb-server-node-tcp', () => ({
  AdbServerNodeTcpConnector: class {
    constructor(readonly spec: unknown) {}
  },
}));

vi.mock('@yume-chan/adb', () => ({
  AdbServerClient: class {
    getVersion(): Promise<number> {
      return io.reachable.shift() === false ? Promise.reject(new Error('ECONNREFUSED')) : Promise.resolve(41);
    }

    trackDevices(): Promise<unknown> {
      return io.trackFailure ? Promise.reject(io.trackFailure) : Promise.resolve(io.observer);
    }

    createAdb(): Promise<unknown> {
      return Promise.resolve({
        close: () => Promise.resolve(),
        subprocess: { noneProtocol: { spawnWaitText: () => Promise.resolve('@@props\nsamsung\nSM-F741B\n16\n36\narm64-v8a') } },
      });
    }
  },
}));

vi.mock('@yume-chan/adb-scrcpy', () => ({
  AdbScrcpyExitedError: class extends Error {},
  AdbScrcpyClient: {
    pushServer: () => Promise.resolve(),
    start: () => (io.startFailure ? Promise.reject(io.startFailure) : Promise.resolve(io.scrcpyClient)),
  },
  AdbScrcpyOptionsLatest: class {},
}));

const { activate, deactivate } = await import('../src/extension');

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
});

const createContext = async () => {
  const root = await createTempRoot();
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets', 'scrcpy-server.jar'), Buffer.from([1]));
  return { subscriptions: [] as { dispose(): unknown }[], extensionUri: vscode.Uri.file(root) };
};

const setup = async (devices = [tangoDevice()]) => {
  const observer = new FakeDeviceObserver(devices);
  io.observer = observer.asObserver();
  io.reachable = [];
  io.trackFailure = undefined;
  io.startFailure = undefined;
  const scrcpy = new FakeScrcpyClient();
  io.scrcpyClient = scrcpy.asClient();
  const context = await createContext();
  activate(context as unknown as vscode.ExtensionContext);
  await flushPromises();
  return { context, scrcpy, channel: window.outputChannels[0]! };
};

const openDevice = async (command = 'reflect.openDevice') => {
  await commands.registered.get(command)?.();
  await flushPromises();
};

const resolveSidebar = () => {
  const view = new FakeWebviewView();
  window.viewProviders.get('reflect.deviceView')?.resolveWebviewView(view);
  return view;
};

describe('extension', () => {
  it('registers the commands, the sidebar view, the status bar and their disposables on activation', async () => {
    const { context } = await setup();
    expect(commands.registered.has('reflect.openDevice')).toBe(true);
    expect(commands.registered.has('reflect.openDeviceInEditor')).toBe(true);
    expect(window.viewProviders.has('reflect.deviceView')).toBe(true);
    expect(window.createOutputChannel).toHaveBeenCalledWith('Reflect for Android', { log: true });
    expect(window.statusBarItems[0]?.text).toBe('$(device-mobile) SM F741B');
    expect(window.treeViews.map((view) => view.id)).toEqual(['reflect.component', 'reflect.deviceInfo']);
    for (const id of ['reflect.refreshDeviceInfo', 'reflect.inspect', 'reflect.stopInspecting', 'reflect.openComponentSource']) {
      expect(commands.registered.has(id)).toBe(true);
    }
    expect(context.subscriptions).toHaveLength(23);
  });

  it('mirrors in the secondary side bar by default', async () => {
    await setup();
    const view = resolveSidebar();
    await openDevice();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.deviceView.focus');
    expect(window.panels).toEqual([]);
    expect(view.webview.posted).toContainEqual({ type: 'session-state', state: 'streaming', deviceName: 'SM F741B' });
  });

  it('mirrors in an editor tab when configured', async () => {
    workspace.configuration.set('reflect.location', 'editor');
    await setup();
    await openDevice();
    expect(window.panels).toHaveLength(1);
  });

  it('cleans everything up when the subscriptions are disposed', async () => {
    const { context, channel } = await setup();
    for (const subscription of context.subscriptions) {
      subscription.dispose();
    }
    deactivate();
    expect(commands.registered.has('reflect.openDevice')).toBe(false);
    expect(window.statusBarItems[0]?.disposed).toBe(true);
    expect(channel.disposed).toBe(true);
  });

  it('copies device info values through the copy command', async () => {
    await setup();
    await commands.registered.get('reflect.copyValue')?.('arm64-v8a');
    await commands.registered.get('reflect.refreshDeviceInfo')?.();
    expect(await vscode.env.clipboard.readText()).toBe('arm64-v8a');
    expect(window.setStatusBarMessage).toHaveBeenCalledWith('$(check) Copied "arm64-v8a"', 2000);
  });

  it('toggles inspect mode on the open mirror and opens component sources', async () => {
    await setup();
    resolveSidebar();
    await openDevice();
    await commands.registered.get('reflect.inspect')?.();
    expect(commands.executeCommand).toHaveBeenCalledWith('setContext', 'reflect.inspecting', true);
    await commands.registered.get('reflect.stopInspecting')?.();
    expect(commands.executeCommand).toHaveBeenCalledWith('setContext', 'reflect.inspecting', false);
    await commands.registered.get('reflect.openComponentSource')?.({ file: '/app/App.tsx', line: 2, column: 1 });
    expect(window.showTextDocument).toHaveBeenCalledOnce();
  });

  it('opens a device before inspecting when no mirror is open', async () => {
    await setup();
    await commands.registered.get('reflect.inspect')?.();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice');
  });

  it('inspects a component end to end and opens its source', async () => {
    const hit = JSON.stringify({ status: 'hit', elementId: 7, rendererID: 1, stacks: ['Error\n    at Demo (http://127.0.0.1:8081/index.bundle:10:4)'] });
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve(
              url.endsWith('/json/list')
                ? [{ id: '1', title: 'app', deviceName: 'SM-F741B', webSocketDebuggerUrl: 'ws://localhost:8081/debug' }]
                : { stack: [{ file: '/workspace/src/Demo.tsx', lineNumber: 58, column: 11, methodName: 'Demo' }] },
            ),
        }),
      ),
    );
    cdp.handle = (request, emit) => {
      const expression = request.params.expression ?? '';
      if (expression.includes('__reflectInspectorHit)')) return { result: { value: hit } };
      if (expression.includes('inspectElement')) {
        emit({
          method: 'Runtime.bindingCalled',
          params: {
            name: '__CHROME_DEVTOOLS_FRONTEND_BINDING__',
            payload: JSON.stringify({
              domain: 'react-devtools',
              message: { event: 'inspectedElement', payload: { responseID: 1, type: 'full-data', value: { displayName: 'PrimaryButton', props: {}, owners: [] } } },
            }),
          },
        });
      }
      return { result: {} };
    };
    await setup();
    const view = resolveSidebar();
    await openDevice();
    await commands.registered.get('reflect.inspect')?.();
    view.webview.received.fire({ type: 'inspect-at', x: 0.5, y: 0.3 });
    await vi.waitFor(() => expect(window.showTextDocument).toHaveBeenCalled());
    expect(window.showTextDocument.mock.calls[0]?.[0]).toMatchObject({ fsPath: '/workspace/src/Demo.tsx' });
    cdp.handle = undefined;
  });

  it('tells the user when no component is under the cursor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ id: '1', title: 'app', deviceName: 'SM-F741B', webSocketDebuggerUrl: 'ws://localhost:8081/debug' }]),
        }),
      ),
    );
    cdp.handle = (request) =>
      (request.params.expression ?? '').includes('__reflectInspectorHit)') ? { result: { value: JSON.stringify({ status: 'miss' }) } } : { result: {} };
    await setup();
    const view = resolveSidebar();
    await openDevice();
    await commands.registered.get('reflect.inspect')?.();
    view.webview.received.fire({ type: 'inspect-at', x: 0.5, y: 0.3 });
    await vi.waitFor(() => expect(window.setStatusBarMessage).toHaveBeenCalledWith('$(info) No React component at that point', 2000));
    cdp.handle = undefined;
  });

  it('reports inspector failures through the error presenter', async () => {
    await setup();
    const view = resolveSidebar();
    await openDevice();
    await commands.registered.get('reflect.inspect')?.();
    view.webview.received.fire({ type: 'inspect-at', x: 0.5, y: 0.5 });
    await vi.waitFor(() => expect(window.showErrorMessage).toHaveBeenCalled());
    expect(window.showErrorMessage.mock.calls[0]?.[0]).toContain('Metro is not running');
  });

  it('masks the IP address and refreshes when privacy settings change', async () => {
    await setup();
    workspace.configuration.set('reflect.privacy.maskIpAddress', true);
    workspace.changeConfiguration('reflect.privacy.maskIpAddress');
    workspace.changeConfiguration('reflect.location');
    await flushPromises();
    expect(window.treeViews.some((view) => view.id === 'reflect.deviceInfo')).toBe(true);
  });

  it('logs when device tracking is unavailable', async () => {
    io.trackFailure = new Error('adb server down');
    const observer = new FakeDeviceObserver();
    io.observer = observer.asObserver();
    io.reachable = [];
    activate((await createContext()) as unknown as vscode.ExtensionContext);
    await flushPromises();
    expect(window.outputChannels[0]?.lines).toContain('error Device tracking unavailable Error: adb server down');
  });

  it('starts the adb server with the configured adb when it is not running', async () => {
    const adb = await createFakeAdb(join(await createTempRoot(), 'bin'));
    workspace.configuration.set('reflect.adbPath', adb);
    io.observer = new FakeDeviceObserver([tangoDevice()]).asObserver();
    io.reachable = [false, true];
    io.trackFailure = undefined;
    activate((await createContext()) as unknown as vscode.ExtensionContext);
    await flushPromises();
    expect(io.execFile).toHaveBeenCalledWith(adb, ['start-server'], { timeout: 15_000 }, expect.any(Function));
  });

  it('opens a mirror panel for the selected device and closes it cleanly', async () => {
    const { scrcpy, channel } = await setup();
    await openDevice('reflect.openDeviceInEditor');
    const panel = window.panels[0]!;
    expect(panel.title).toBe('SM F741B');
    scrcpy.output.push('server ready');
    scrcpy.clipboard.push('from phone');
    panel.webview.received.fire({ type: 'paste' });
    panel.webview.received.fire({ type: 'log', level: 'error', message: 'decoder' });
    await vi.waitFor(() => expect(channel.lines).toContain('info [scrcpy] server ready'));
    expect(channel.lines).toContain('error [webview] decoder');
    expect(await vscode.env.clipboard.readText()).toBe('from phone');
    panel.dispose();
    await flushPromises();
    expect(window.statusBarItems[0]?.text).toBe('$(device-mobile) SM F741B');
  });

  it('presents mirroring failures and shows the logs on request', async () => {
    const { channel } = await setup();
    io.startFailure = new Error('server crashed');
    window.chooseErrorAction('Show logs');
    await openDevice();
    await vi.waitFor(() => expect(channel.shown).toBe(1));
    expect(window.showErrorMessage.mock.calls[0]?.[0]).toContain('could not start mirroring');
  });
});
