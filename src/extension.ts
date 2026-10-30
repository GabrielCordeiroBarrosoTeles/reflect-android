import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import * as vscode from 'vscode';
import { AdbServerGateway, DEFAULT_ADB_ENDPOINT } from './adb/AdbServerGateway';
import { DeviceSelectionService } from './adb/DeviceSelectionService';
import { DeviceTracker } from './adb/DeviceTracker';
import { createHelperProcessFactory } from './ios/HelperProcess';
import { IosPlatform } from './ios/IosPlatform';
import { assertExecutable, spawnHelper } from './ios/nodeAdapters';
import { SimctlRunner } from './ios/SimctlRunner';
import { SimulatorAppWindow } from './ios/SimulatorAppWindow';
import { SimulatorDiscovery } from './ios/SimulatorDiscovery';
import type { SimctlExecFile } from './ios/types';
import { CompositeDeviceDiscovery } from './devices/CompositeDeviceDiscovery';
import { PlatformScopedDeviceContext } from './device/PlatformScopedDeviceContext';
import { AndroidPlatform } from './platform/android/AndroidPlatform';
import { PlatformRegistry } from './platform/PlatformRegistry';
import type { Device, IDeviceDiscovery } from './devices/types';
import type { IPlatform } from './platform/types';
import { isReady } from './devices/types';
import { ExecFileProcessRunner } from './adb/ExecFileProcessRunner';
import { createAdbLocator } from './adb/locator/createAdbLocator';
import { CommandIds } from './commands/commandIds';
import { CopyValueCommand } from './commands/CopyValueCommand';
import { InspectCommand, OpenComponentSourceCommand, StopInspectingCommand } from './commands/InspectCommands';
import { MoveMirrorCommand } from './commands/MoveMirrorCommand';
import { BootSimulatorCommand } from './commands/BootSimulatorCommand';
import { ShowInSimulatorCommand } from './commands/ShowInSimulatorCommand';
import { OpenDeviceCommand } from './commands/OpenDeviceCommand';
import { RefreshDeviceInfoCommand } from './commands/RefreshDeviceInfoCommand';
import { RunActionCommand } from './commands/RunActionCommand';
import { CaptureStore } from './capture/CaptureStore';
import { resolveCapturesDirectory } from './capture/resolveCapturesDirectory';
import type { CaptureKind } from './capture/types';
import type { ClipboardResult } from './capture/SystemClipboard';
import { SystemClipboard } from './capture/SystemClipboard';
import { AdbPortReverse } from './device/AdbPortReverse';
import { AppReloader } from './inspector/AppReloader';
import { MediabunnyMuxer } from './recording/MediabunnyMuxer';
import { Mp4Recorder } from './recording/Mp4Recorder';
import { parseH264 } from './recording/parseH264';
import { ACTION_IDS } from './shared/actions';
import type { ICommand } from './commands/types';
import type { ILogger } from './core/types';
import { ActiveDeviceContext } from './device/ActiveDeviceContext';
import { AdbDeviceShell } from './device/AdbDeviceShell';
import { DeviceLeasePool } from './device/DeviceLeasePool';
import { DeviceInfoCollector } from './deviceInfo/DeviceInfoCollector';
import { DeviceInfoPoller } from './deviceInfo/DeviceInfoPoller';
import { AddStorageKeyCommand, ClearStorageCommand, CopyStorageJsonCommand, RefreshStorageCommand } from './commands/StorageCommands';
import { AppConnectionWatcher } from './storage/AppConnectionWatcher';
import { AsyncStorageReader } from './storage/AsyncStorageReader';
import { ComponentTab } from './tools/ComponentTab';
import { DeviceTab } from './tools/DeviceTab';
import { NetworkTab } from './tools/NetworkTab';
import { NetworkReader } from './network/NetworkReader';
import { LogReader } from './logs/LogReader';
import { LogsTab } from './tools/LogsTab';
import { ActionsTab } from './tools/ActionsTab';
import { MementoLinkHistory } from './tools/MementoLinkHistory';
import { PerformanceTab } from './tools/PerformanceTab';
import { PerformanceReader } from './performance/PerformanceReader';
import { StorageTab } from './tools/StorageTab';
import { TOOLS_VIEW_ID, ToolsViewProvider } from './tools/ToolsViewProvider';
import { CdpSession } from './inspector/CdpSession';
import { ComponentInspector } from './inspector/ComponentInspector';
import { FetchHttpClient } from './inspector/FetchHttpClient';
import { InspectController } from './inspector/InspectController';
import { MetroClient } from './inspector/MetroClient';
import { MetroConnection } from './inspector/MetroConnection';
import { openSource } from './inspector/openSource';
import { WsSocket } from './inspector/WsSocket';
import { MirrorController } from './mirror/MirrorController';
import { MirrorManager } from './mirror/MirrorManager';
import { MirrorPanel } from './mirror/MirrorPanel';
import { MIRROR_VIEW_ID, MirrorViewProvider } from './mirror/MirrorViewProvider';
import { SidebarResume } from './mirror/SidebarResume';
import type { IMirrorSurface, MirrorLocation, MirrorServices } from './mirror/types';
import { AdbScrcpyLauncher } from './scrcpy/AdbScrcpyLauncher';
import { FileServerBinary } from './scrcpy/FileServerBinary';
import { SCRCPY_SERVER_ASSET, SCRCPY_SERVER_VERSION } from './scrcpy/serverConstants';
import type { MirrorOptions } from './scrcpy/types';
import { ErrorPresenter } from './ui/ErrorPresenter';
import { QuickPickDevicePicker } from './ui/QuickPickDevicePicker';
import { StatusBarPresenter } from './ui/StatusBarPresenter';

const ADB_START_TIMEOUT_MS = 15_000;
const DEVICE_INFO_INTERVAL_MS = 5_000;
const SIMCTL_TIMEOUT_MS = 15_000;
const XATTR_TIMEOUT_MS = 5_000;
const SIMULATOR_APP_TIMEOUT_MS = 10_000;
const SIMULATOR_BOOT_TIMEOUT_MS = 60_000;
const IOS_HELPER_ASSET = ['assets', 'ios-helper', 'reflect-sim-helper'];
const SIMULATOR_POLL_INTERVAL_MS = 2_000;
const COPY_FEEDBACK_MS = 2_000;
const METRO_TIMEOUT_MS = 3_000;
const INSPECTOR_TIMING = { pollIntervalMs: 30, pollAttempts: 50, timeoutMs: 5_000 };
const DEFAULT_METRO_PORT = 8081;
const CLIPBOARD_TIMEOUT_MS = 10_000;
const RECONNECT_TIMING = { baseDelayMs: 500, maxDelayMs: 8_000, giveUpAfterMs: 120_000 };

const MIRROR_OPTIONS: MirrorOptions = {
  maxSize: 1920,
  videoBitRate: 8_000_000,
  maxFps: 60,
};

const readAdbPathSetting = (): string | undefined =>
  vscode.workspace.getConfiguration('reflect').get<string>('adbPath');

const reflectSetting = <T>(key: string): T | undefined => vscode.workspace.getConfiguration('reflect').get<T>(key);

const APP_WATCH_INTERVAL_MS = 5_000;
const NETWORK_POLL_MS = 1_000;
const LOGS_POLL_MS = 1_000;
const DEEP_LINKS_KEY = 'reflect.recentDeepLinks';
const PERFORMANCE_POLL_MS = 2_000;
const readMetroPort = (): number => reflectSetting<number>('metroPort') ?? DEFAULT_METRO_PORT;

const readLocationSetting = (): MirrorLocation =>
  vscode.workspace.getConfiguration('reflect').get<MirrorLocation>('location') === 'editor' ? 'editor' : 'secondarySidebar';

const CAPTURE_LABELS: Readonly<Record<CaptureKind, string>> = { screenshot: 'Screenshot', recording: 'Recording' };

const CLIPBOARD_HINTS: Readonly<Record<ClipboardResult | 'off', string>> = {
  copied: ' — copied, paste it anywhere',
  'path-copied': ' — path copied',
  off: '',
};

const announceCapture = async (kind: CaptureKind, path: string, clipboard: ClipboardResult | 'off'): Promise<void> => {
  const uri = vscode.Uri.file(path);
  const choice = await vscode.window.showInformationMessage(
    `${CAPTURE_LABELS[kind]} saved: ${vscode.workspace.asRelativePath(uri)}${CLIPBOARD_HINTS[clipboard]}`,
    'Open',
    'Reveal',
  );
  if (choice === 'Open') {
    await vscode.commands.executeCommand('vscode.open', uri);
  }
  if (choice === 'Reveal') {
    await vscode.commands.executeCommand('revealFileInOS', uri);
  }
};

const createLogger = (channel: vscode.LogOutputChannel): ILogger => ({
  info: (message) => channel.info(message),
  error: (message, error) => channel.error(message, ...(error === undefined ? [] : [error])),
});

const registerCommands = (context: vscode.ExtensionContext, commands: readonly ICommand[]): void => {
  for (const command of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(command.id, (...args: unknown[]) => command.execute(...args)));
  }
};

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Reflect for Android', { log: true });
  const logger = createLogger(outputChannel);
  const locator = createAdbLocator(readAdbPathSetting);
  const gateway = new AdbServerGateway(
    locator,
    new ExecFileProcessRunner(promisify(execFile), ADB_START_TIMEOUT_MS),
    new AdbServerClient(new AdbServerNodeTcpConnector(DEFAULT_ADB_ENDPOINT)),
  );
  const launcher = new AdbScrcpyLauncher();
  const pool = new DeviceLeasePool(gateway, logger);
  const tracker = new DeviceTracker(gateway);
  const serverBinary = new FileServerBinary(
    vscode.Uri.joinPath(context.extensionUri, SCRCPY_SERVER_ASSET).fsPath,
    SCRCPY_SERVER_VERSION,
  );
  const discoverySources: IDeviceDiscovery[] = [tracker];
  const platformList: IPlatform[] = [new AndroidPlatform(pool, launcher, serverBinary, MIRROR_OPTIONS, logger)];
  const simctl = new SimctlRunner(execFile as SimctlExecFile, SIMCTL_TIMEOUT_MS);
  const simulatorWindow = new SimulatorAppWindow(
    () => reflectSetting<string>('ios.simulatorWindow'),
    new ExecFileProcessRunner(promisify(execFile), SIMULATOR_APP_TIMEOUT_MS),
    logger,
  );
  if (process.platform === 'darwin') {
    discoverySources.push(new SimulatorDiscovery(simctl, logger, SIMULATOR_POLL_INTERVAL_MS));
    const spawnHelperProcess = createHelperProcessFactory({
      helperPath: vscode.Uri.joinPath(context.extensionUri, ...IOS_HELPER_ASSET).fsPath,
      assertExecutable,
      runner: new ExecFileProcessRunner(promisify(execFile), XATTR_TIMEOUT_MS),
      spawn: spawnHelper,
      logger,
    });
    platformList.push(new IosPlatform(spawnHelperProcess, simctl, logger, simulatorWindow));
  }
  const discovery = new CompositeDeviceDiscovery(discoverySources);
  const activeDevice = new ActiveDeviceContext(discovery);
  const androidDevice = new PlatformScopedDeviceContext(activeDevice, 'android');
  const statusBar = new StatusBarPresenter(activeDevice, CommandIds.openDevice);
  const errors = new ErrorPresenter(CommandIds.openDevice, () => outputChannel.show());
  const platforms = new PlatformRegistry(platformList);
  const clipboard = {
    readText: () => Promise.resolve(vscode.env.clipboard.readText()),
    writeText: (text: string) => Promise.resolve(vscode.env.clipboard.writeText(text)),
  };
  const notify = (message: string): void => void vscode.window.setStatusBarMessage(`$(info) ${message}`, COPY_FEEDBACK_MS);
  const metro = new MetroClient(new FetchHttpClient(fetch, METRO_TIMEOUT_MS), readMetroPort);
  const connectCdp = (url: string) =>
    CdpSession.connect(url, metro.origins, (target, origin) => new WsSocket(target, origin), INSPECTOR_TIMING.timeoutMs);
  const appReloader = new AppReloader(metro, connectCdp);
  const appConnection = new MetroConnection(metro, connectCdp, INSPECTOR_TIMING.timeoutMs);
  const portReverse = new AdbPortReverse(pool);
  const systemClipboard = new SystemClipboard(process.platform, new ExecFileProcessRunner(promisify(execFile), CLIPBOARD_TIMEOUT_MS), clipboard.writeText);
  const handleCapture = async (kind: CaptureKind, path: string): Promise<void> => {
    const result = reflectSetting<boolean>('copyCapturesToClipboard') === false ? 'off' : await systemClipboard.copy(kind, path);
    await announceCapture(kind, path, result);
  };
  const captures = new CaptureStore(() =>
    resolveCapturesDirectory(reflectSetting<string>('capturesDirectory'), vscode.workspace.workspaceFolders?.[0]?.uri.fsPath),
  );
  const deviceShell = new AdbDeviceShell(pool);
  const deviceInfoPoller = new DeviceInfoPoller(new DeviceInfoCollector(deviceShell), DEVICE_INFO_INTERVAL_MS);
  const appWatcher = new AppConnectionWatcher(metro, activeDevice, (connected) => void vscode.commands.executeCommand('setContext', 'reflect.appConnected', connected), APP_WATCH_INTERVAL_MS);
  const showCopied = (message: string): void => void vscode.window.setStatusBarMessage(`$(check) ${message}`, COPY_FEEDBACK_MS);
  const confirm = async (message: string, action: string): Promise<boolean> => (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action;
  const tools = new ToolsViewProvider(
    context.extensionUri,
    { app: appWatcher, clipboard, notify: showCopied, setTabContext: (tab) => void vscode.commands.executeCommand('setContext', 'reflect.toolsTab', tab),
      context: activeDevice,
      capabilities: (device) => platforms.capabilities(device),
    },
    (channel) => ({
      component: new ComponentTab(channel, openSource),
      network: new NetworkTab(new NetworkReader(appConnection), activeDevice, channel, NETWORK_POLL_MS),
      logs: new LogsTab(new LogReader(deviceShell), androidDevice, channel, LOGS_POLL_MS),
      performance: new PerformanceTab(new PerformanceReader(deviceShell), androidDevice, channel, PERFORMANCE_POLL_MS),
      actions: new ActionsTab(
        {
          shell: deviceShell,
          context: androidDevice,
          confirm,
          links: new MementoLinkHistory(context.globalState, DEEP_LINKS_KEY),
        },
        channel,
      ),
      device: new DeviceTab(deviceInfoPoller, androidDevice, () => ({ maskIpAddress: reflectSetting<boolean>('privacy.maskIpAddress') === true }), channel),
      storage: new StorageTab(
        {
          reader: new AsyncStorageReader(appConnection, INSPECTOR_TIMING),
          context: activeDevice,
          onDidChangeConnection: appWatcher.onDidChange,
          confirm,
          notify: showCopied,
        },
        channel,
      ),
    }),
  );
  const { component: componentTab, device: deviceTab, storage: storageTab, network: networkTab, logs: logsTab, performance: performanceTab } = tools.tabs;
  const inspectController = new InspectController({
    inspector: new ComponentInspector(appConnection, metro, INSPECTOR_TIMING),
    mirrors: { setInspectMode: (active) => mirrors.setInspectMode(active) },
    view: componentTab,
    openSource,
    onError: (error) => void errors.present(error),
    notify,
    setActiveContext: (active) => void vscode.commands.executeCommand('setContext', 'reflect.inspecting', active),
    shouldOpenSource: () => reflectSetting<boolean>('inspector.openSourceOnSelect') !== false,
  });
  const mirrorServices: MirrorServices = {
    logger,
    clipboard,
    onError: (error) => void errors.present(error),
    inspector: inspectController,
    actions: {
      reloadApp: (device) => appReloader.reload(device),
      reverseMetro: async (device) => {
        const port = readMetroPort();
        await portReverse.reverse(device.id, port);
        return port;
      },
      notify,
    },
    captures,
    createRecorder: (path, onFormatChange) => new Mp4Recorder(path, (file) => new MediabunnyMuxer(file), parseH264, onFormatChange),
    onCaptured: (kind, path) => void handleCapture(kind, path),
    availability: {
      onDidChange: activeDevice.onDidChange,
      isReady: (serial) => activeDevice.devices.some((device) => device.id === serial && isReady(device)),
    },
    reconnectTiming: RECONNECT_TIMING,
    capabilities: (device) => platforms.capabilities(device),
  };
  const sidebar = new MirrorViewProvider(context.extensionUri, discovery, simulatorWindow);
  const createSurface = (device: Device, location: MirrorLocation): IMirrorSurface =>
    location === 'editor' ? new MirrorPanel(device, context.extensionUri) : sidebar.claim(device);
  const mirrors = new MirrorManager(
    (device, location) =>
      new MirrorController(
        device,
        createSurface(device, location),
        platforms.get(device).createMirrorSession(device),
        mirrorServices,
      ),
  );
  const picker = new QuickPickDevicePicker();
  const selection = new DeviceSelectionService(discovery, picker);

  context.subscriptions.push(
    outputChannel,
    appWatcher,
    tools,
    deviceTab,
    storageTab,
    networkTab,
    logsTab,
    performanceTab,
    vscode.window.registerWebviewViewProvider(TOOLS_VIEW_ID, tools),
    appConnection,
    discovery,
    simulatorWindow,
    selection,
    activeDevice,
    statusBar,
    deviceInfoPoller,
    mirrors,
    sidebar,
    new SidebarResume(mirrors, sidebar.onDidChangeVisibility),
    vscode.window.registerWebviewViewProvider(MIRROR_VIEW_ID, sidebar),
    mirrors.onDidClose(() => activeDevice.setMirroredDevice(undefined)),
    mirrors.onDidOpen((device) => activeDevice.setMirroredDevice(device)),
    mirrors.onDidClose(() => inspectController.cancel()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('reflect.privacy')) {
        deviceTab.refresh();
      }
    }),
    inspectController,
    pool,
  );

  registerCommands(context, [
    new OpenDeviceCommand(CommandIds.openDevice, readLocationSetting, selection, mirrors, activeDevice, errors),
    new OpenDeviceCommand(CommandIds.openDeviceInEditor, () => 'editor', selection, mirrors, activeDevice, errors),
    new MoveMirrorCommand(CommandIds.moveToEditor, 'editor', mirrors, () =>
      Promise.resolve(vscode.commands.executeCommand(CommandIds.openDeviceInEditor)),
    ),
    new MoveMirrorCommand(CommandIds.moveToSidebar, 'secondarySidebar', mirrors, () =>
      Promise.resolve(vscode.commands.executeCommand(CommandIds.openDevice)),
    ),
    new BootSimulatorCommand(
      simctl,
      discovery,
      picker,
      async (deviceId) => void (await vscode.commands.executeCommand(CommandIds.openDevice, deviceId)),
      errors,
      SIMULATOR_BOOT_TIMEOUT_MS,
    ),
    new ShowInSimulatorCommand(simulatorWindow, errors),
    new RefreshDeviceInfoCommand(deviceTab),
    new InspectCommand(inspectController, () => mirrors.hasOpenMirror, () => Promise.resolve(vscode.commands.executeCommand(CommandIds.openDevice))),
    new StopInspectingCommand(inspectController),
    new OpenComponentSourceCommand(openSource),
    ...ACTION_IDS.map((id) => new RunActionCommand(id, mirrors, notify)),
    new CopyValueCommand(clipboard, showCopied),
    new RefreshStorageCommand(storageTab),
    new AddStorageKeyCommand(storageTab),
    new ClearStorageCommand(storageTab),
    new CopyStorageJsonCommand(storageTab, clipboard, showCopied),
  ]);

  context.subscriptions.push(discovery.onDidFail((error) => logger.error('Device tracking unavailable', error)));
  void discovery.start();
}

export function deactivate(): void {}
