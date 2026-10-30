import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createFakeAdb, createTempRoot } from './adb/locator/fs';
import { FakeScrcpyClient } from './fakes/FakeScrcpyClient';
import { flushPromises } from './fakes/PushStream';
import { FakeChildProcess, helloBytes, videoConfigBytes, videoFrameBytes } from './fakes/FakeHelperProcess';
import { FakeDeviceObserver } from './fakes/FakeDeviceObserver';
import { tangoDevice } from './fakes/devices';
import { DEVICE_CONFIGURATION } from './fakes/h264';
import { FakeWebviewView, commands, window, workspace } from './mocks/vscode';

const io = vi.hoisted(() => ({
  reachable: [] as boolean[],
  observer: undefined as unknown,
  trackFailure: undefined as Error | undefined,
  simctlJson: '{"devices":{}}',
  bootedJson: undefined as string | undefined,
  child: undefined as unknown,
  execFile: vi.fn((file: string, args: string[], _options: unknown, callback: (error: Error | null, stdout?: string) => void) => {
    if (file === 'xcrun' && args[1] === 'boot' && io.bootedJson) {
      io.simctlJson = io.bootedJson;
    }
    callback(null, file === 'xcrun' ? io.simctlJson : undefined);
    return { stdin: null };
  }),
  scrcpyClient: undefined as unknown,
  startFailure: undefined as Error | undefined,
}));

vi.mock('node:child_process', () => ({ execFile: io.execFile }));

vi.mock('../src/ios/nodeAdapters', () => ({
  assertExecutable: () => Promise.resolve(),
  spawnHelper: () => io.child,
}));

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
        reverse: { addExternal: (device: string) => Promise.resolve(device) },
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
  io.simctlJson = '{"devices":{}}';
  io.bootedJson = undefined;
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('ECONNREFUSED'))));
});

const createContext = async () => {
  const root = await createTempRoot();
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'assets', 'scrcpy-server.jar'), Buffer.from([1]));
  const stored = new Map<string, unknown>();
  const globalState = { get: <T>(key: string, fallback: T): T => (stored.has(key) ? (stored.get(key) as T) : fallback), update: (key: string, value: unknown) => (stored.set(key, value), Promise.resolve()) };
  return { subscriptions: [] as { dispose(): unknown }[], extensionUri: vscode.Uri.file(root), globalState };
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
    expect(window.createOutputChannel).toHaveBeenCalledWith('Reflect', { log: true });
    expect(window.statusBarItems[0]?.text).toBe('$(device-mobile) SM F741B');
    expect(window.treeViews).toEqual([]);
    expect(window.viewProviders.has('reflect.tools')).toBe(true);
    for (const id of ['reflect.refreshDeviceInfo', 'reflect.inspect', 'reflect.stopInspecting', 'reflect.openComponentSource']) {
      expect(commands.registered.has(id)).toBe(true);
    }
    expect(commands.registered.has('reflect.action.screenshot')).toBe(true);
    expect(commands.registered.has('reflect.moveToEditor')).toBe(true);
    expect(commands.registered.has('reflect.bootSimulator')).toBe(true);
    expect(commands.registered.has('reflect.showInSimulator')).toBe(true);
    expect(context.subscriptions).toHaveLength(52);
  });

  it('mirrors in the secondary side bar by default', async () => {
    await setup();
    const view = resolveSidebar();
    await openDevice();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.deviceView.focus');
    expect(window.panels).toEqual([]);
    expect(view.webview.posted).toContainEqual({ deviceId: 'R5CX123', message: { type: 'session-state', state: 'streaming', deviceName: 'SM F741B' } });
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

  it('wires the AsyncStorage panel, its commands and the confirmation', async () => {
    await setup();
    expect(commands.executeCommand).toHaveBeenCalledWith('setContext', 'reflect.appConnected', false);
    await commands.registered.get('reflect.refreshStorage')?.();
    await commands.registered.get('reflect.copyStorageJson')?.();
    expect(await vscode.env.clipboard.readText()).toBe('{}');
    await commands.registered.get('reflect.addStorageKey')?.();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.tools.focus');
    window.showWarningMessage.mockResolvedValueOnce('Delete All').mockResolvedValueOnce(undefined);
    await commands.registered.get('reflect.clearStorage')?.();
    await commands.registered.get('reflect.clearStorage')?.();
    expect(window.showWarningMessage).toHaveBeenCalledWith("Delete all 0 keys from the app's AsyncStorage?", { modal: true }, 'Delete All');
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
    view.webview.received.fire({ deviceId: undefined, message: { type: 'inspect-at', x: 0.5, y: 0.3 } });
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
    view.webview.received.fire({ deviceId: undefined, message: { type: 'inspect-at', x: 0.5, y: 0.3 } });
    await vi.waitFor(() => expect(window.setStatusBarMessage).toHaveBeenCalledWith('$(info) No React component at that point', 2000));
    cdp.handle = undefined;
  });

  it('reports inspector failures through the error presenter', async () => {
    await setup();
    const view = resolveSidebar();
    await openDevice();
    await commands.registered.get('reflect.inspect')?.();
    view.webview.received.fire({ deviceId: undefined, message: { type: 'inspect-at', x: 0.5, y: 0.5 } });
    await vi.waitFor(() => expect(window.showErrorMessage).toHaveBeenCalled());
    expect(window.showErrorMessage.mock.calls[0]?.[0]).toContain('Metro is not running');
  });

  it('masks the IP address and refreshes when privacy settings change', async () => {
    await setup();
    workspace.configuration.set('reflect.privacy.maskIpAddress', true);
    workspace.changeConfiguration('reflect.privacy.maskIpAddress');
    workspace.changeConfiguration('reflect.location');
    await flushPromises();
    const view = new FakeWebviewView();
    window.viewProviders.get('reflect.tools')?.resolveWebviewView(view);
    view.webview.received.fire({ type: 'tab-changed', tab: 'device' });
    for (let attempt = 0; attempt < 20 && !view.webview.posted.some((message) => (message as { state?: { kind?: string } }).state?.kind === 'loaded'); attempt += 1) {
      await flushPromises();
    }
    const loaded = view.webview.posted.find((message) => (message as { type: string; state?: { kind?: string } }).type === 'device' && (message as { state: { kind: string } }).state.kind === 'loaded');
    expect(loaded).toMatchObject({ type: 'device', state: { kind: 'loaded' } });
  });

  it('saves a screenshot into the configured folder and offers to open or reveal it', async () => {
    const folder = await createTempRoot();
    workspace.configuration.set('reflect.capturesDirectory', folder);
    await setup();
    const view = resolveSidebar();
    await openDevice();
    window.showInformationMessage.mockImplementationOnce(() => Promise.resolve('Open'));
    await commands.registered.get('reflect.action.screenshot')?.();
    await vi.waitFor(() => expect(view.webview.posted).toContainEqual({ deviceId: 'R5CX123', message: { type: 'capture-screenshot', requestId: 1 } }));
    view.webview.received.fire({ deviceId: undefined, message: { type: 'screenshot', requestId: 1, data: new Uint8Array([137, 80]) } });
    await vi.waitFor(() => expect(commands.executeCommand).toHaveBeenCalledWith('vscode.open', expect.objectContaining({ fsPath: expect.stringContaining(folder) })));
    expect(window.showInformationMessage.mock.calls[0]?.[0]).toMatch(/copied/);
    window.showInformationMessage.mockImplementationOnce(() => Promise.resolve('Reveal'));
    await commands.registered.get('reflect.action.screenshot')?.();
    await vi.waitFor(() => expect(view.webview.posted).toContainEqual({ deviceId: 'R5CX123', message: { type: 'capture-screenshot', requestId: 2 } }));
    view.webview.received.fire({ deviceId: undefined, message: { type: 'screenshot', requestId: 2, data: new Uint8Array([1]) } });
    await vi.waitFor(() => expect(commands.executeCommand).toHaveBeenCalledWith('revealFileInOS', expect.anything()));
  });

  it('records into the workspace folder, reverses Metro and reloads with the key fallback', async () => {
    const folder = await createTempRoot();
    workspace.workspaceFolders = [{ uri: vscode.Uri.file(folder) }];
    const { scrcpy } = await setup();
    resolveSidebar();
    await openDevice();
    await commands.registered.get('reflect.action.record')?.();
    await commands.registered.get('reflect.action.record')?.();
    await vi.waitFor(() => expect(window.setStatusBarMessage).toHaveBeenCalledWith('$(info) Nothing was recorded', 2000));
    await commands.registered.get('reflect.action.record')?.();
    await flushPromises();
    scrcpy.video.push({ type: 'configuration', data: DEVICE_CONFIGURATION });
    scrcpy.video.push({ type: 'data', keyframe: true, pts: 0n, data: Uint8Array.from([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00]) });
    scrcpy.video.push({ type: 'data', keyframe: false, pts: 33_333n, data: Uint8Array.from([0, 0, 0, 1, 0x41, 0x9a, 0x02]) });
    await flushPromises();
    await commands.registered.get('reflect.action.record')?.();
    await vi.waitFor(() => expect(window.showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('Recording saved'), 'Open', 'Reveal'));
    await commands.registered.get('reflect.action.reverseMetro')?.();
    await vi.waitFor(() => expect(window.setStatusBarMessage).toHaveBeenCalledWith('$(info) adb reverse tcp:8081 is active', 2000));
    await commands.registered.get('reflect.action.reload')?.();
    await vi.waitFor(() => expect(scrcpy.writer.methods().filter((method) => method === 'injectKeyCode').length).toBeGreaterThanOrEqual(4));
  });

  it('skips the clipboard when disabled', async () => {
    const folder = await createTempRoot();
    workspace.configuration.set('reflect.capturesDirectory', folder);
    workspace.configuration.set('reflect.copyCapturesToClipboard', false);
    await setup();
    const view = resolveSidebar();
    await openDevice();
    io.execFile.mockClear();
    await commands.registered.get('reflect.action.screenshot')?.();
    await vi.waitFor(() => expect(view.webview.posted).toContainEqual({ deviceId: 'R5CX123', message: { type: 'capture-screenshot', requestId: 1 } }));
    view.webview.received.fire({ deviceId: undefined, message: { type: 'screenshot', requestId: 1, data: new Uint8Array([1]) } });
    await vi.waitFor(() => expect(window.showInformationMessage).toHaveBeenCalled());
    expect(window.showInformationMessage.mock.calls[0]?.[0]).not.toMatch(/copied/);
    expect(io.execFile).not.toHaveBeenCalled();
  });

  it('moves the mirror between the side bar and an editor tab', async () => {
    await setup();
    resolveSidebar();
    await commands.registered.get('reflect.moveToSidebar')?.();
    await flushPromises();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice');
    await openDevice();
    await commands.registered.get('reflect.moveToEditor')?.();
    await flushPromises();
    expect(window.panels).toHaveLength(1);
    expect(window.statusBarItems[0]?.text).toBe('$(device-mobile) SM F741B');
    await commands.registered.get('reflect.moveToSidebar')?.();
    await flushPromises();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.deviceView.focus');
    await commands.registered.get('reflect.moveToEditor')?.();
    await flushPromises();
    expect(window.panels).toHaveLength(2);
  });

  it('opens a device in an editor tab when moving with nothing mirrored', async () => {
    await setup();
    await commands.registered.get('reflect.moveToEditor')?.();
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDeviceInEditor');
  });

  it('reconnects the mirror when the device comes back after a disconnect', async () => {
    const observer = new FakeDeviceObserver([tangoDevice()]);
    io.observer = observer.asObserver();
    io.reachable = [];
    io.trackFailure = undefined;
    io.startFailure = undefined;
    const scrcpy = new FakeScrcpyClient();
    io.scrcpyClient = scrcpy.asClient();
    activate((await createContext()) as unknown as vscode.ExtensionContext);
    await flushPromises();
    const view = resolveSidebar();
    await openDevice();
    io.scrcpyClient = new FakeScrcpyClient().asClient();
    scrcpy.exit();
    await vi.waitFor(() => expect(view.webview.posted).toContainEqual(expect.objectContaining({ message: expect.objectContaining({ detail: 'Reconnecting… plug the cable back in' }) })));
    observer.emitList([tangoDevice()]);
    await vi.waitFor(() =>
      expect(view.webview.posted.filter((message) => (message as { message: { state?: string } }).message.state === 'streaming')).toHaveLength(2),
    );
  });

  it('asks to open a device before running an action', async () => {
    await setup();
    await commands.registered.get('reflect.action.home')?.();
    expect(window.setStatusBarMessage).toHaveBeenCalledWith('$(info) Open a device first', 2000);
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

  describe.each([
    ['darwin', true],
    ['linux', false],
  ])('on %s', (platform, discoversSimulators) => {
    it(`${discoversSimulators ? 'polls' : 'does not poll'} simctl for iOS Simulators`, async () => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { value: platform });
      let context: Awaited<ReturnType<typeof setup>>['context'];
      try {
        ({ context } = await setup());
      } finally {
        Object.defineProperty(process, 'platform', original);
      }
      const simctlCalls = io.execFile.mock.calls.filter(([file]) => file === 'xcrun');
      expect(simctlCalls.length > 0).toBe(discoversSimulators);
      if (discoversSimulators) {
        expect(simctlCalls[0]?.[1]).toEqual(['simctl', 'list', 'devices', '-j']);
      }
      const clearTimer = vi.spyOn(globalThis, 'clearTimeout');
      for (const subscription of context.subscriptions) {
        subscription.dispose();
      }
      if (discoversSimulators) {
        expect(clearTimer).toHaveBeenCalled();
      }
    });
  });

  describe('iOS Simulators on darwin', () => {
    const simulatorsJson = (state: string) =>
      JSON.stringify({
        devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-26-0': [{ udid: 'UDID-1', name: 'iPhone 15', state, isAvailable: true }] },
      });

    const setupDarwin = async () => {
      const original = Object.getOwnPropertyDescriptor(process, 'platform')!;
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      try {
        return await setup([]);
      } finally {
        Object.defineProperty(process, 'platform', original);
      }
    };

    it('brings a booted simulator into Reflect and hides the Simulator app', async () => {
      io.simctlJson = simulatorsJson('Booted');
      const child = new FakeChildProcess();
      io.child = child;
      await setupDarwin();
      const view = resolveSidebar();
      view.webview.received.fire({ deviceId: undefined, message: { type: 'ready' } });
      expect(view.webview.posted).toContainEqual({
        deviceId: undefined,
        message: {
          type: 'device-list',
          devices: [{ id: 'UDID-1', name: 'iPhone 15', detail: 'iOS 26.0', platform: 'ios', kind: 'simulator', state: 'ready' }],
        },
      });
      await commands.registered.get('reflect.openDevice')?.('UDID-1');
      await flushPromises();
      child.stdout.emit(helloBytes());
      child.stdout.emit(videoConfigBytes(884, 1920, [0, 0, 0, 1, 0x67]));
      child.stdout.emit(videoFrameBytes(true, 0, [0, 0, 0, 1, 0x65]));
      await flushPromises();
      expect(child.written).toContain('{"type":"simulatorApp","action":"hide"}\n');
      expect(view.webview.posted).toContainEqual({ deviceId: 'UDID-1', message: { type: 'session-state', state: 'streaming', deviceName: 'iPhone 15' } });
      await commands.registered.get('reflect.showInSimulator')?.();
      expect(io.execFile).toHaveBeenCalledWith('open', ['-a', 'Simulator'], expect.anything(), expect.any(Function));
    });

    it('quits the Simulator app when configured', async () => {
      workspace.configuration.set('reflect.ios.simulatorWindow', 'quit');
      io.simctlJson = simulatorsJson('Booted');
      const child = new FakeChildProcess();
      io.child = child;
      await setupDarwin();
      await commands.registered.get('reflect.openDevice')?.('UDID-1');
      await flushPromises();
      child.stdout.emit(helloBytes());
      child.stdout.emit(videoConfigBytes(884, 1920, [0, 0, 0, 1, 0x67]));
      child.stdout.emit(videoFrameBytes(true, 0, [0, 0, 0, 1, 0x65]));
      await flushPromises();
      expect(io.execFile).toHaveBeenCalledWith('osascript', ['-e', 'quit app "Simulator"'], expect.anything(), expect.any(Function));
    });

    it('boots a shut-down simulator headless and opens it when discovery reports it ready', async () => {
      io.simctlJson = simulatorsJson('Shutdown');
      io.bootedJson = simulatorsJson('Booted');
      await setupDarwin();
      commands.executeCommand.mockClear();
      await commands.registered.get('reflect.bootSimulator')?.('UDID-1');
      expect(io.execFile).toHaveBeenCalledWith('xcrun', ['simctl', 'boot', 'UDID-1'], { timeout: 120_000 }, expect.any(Function));
      expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice', 'UDID-1');
    }, 10_000);
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
    panel.webview.received.fire({ deviceId: undefined, message: { type: 'paste' } });
    panel.webview.received.fire({ deviceId: undefined, message: { type: 'log', level: 'error', message: 'decoder' } });
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
