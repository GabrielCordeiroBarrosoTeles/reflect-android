import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AdbServerClient } from '@yume-chan/adb';
import { AdbServerNodeTcpConnector } from '@yume-chan/adb-server-node-tcp';
import * as vscode from 'vscode';
import { AdbServerGateway, DEFAULT_ADB_ENDPOINT } from './adb/AdbServerGateway';
import { DeviceSelectionService } from './adb/DeviceSelectionService';
import { DeviceTracker } from './adb/DeviceTracker';
import type { DeviceInfo } from './adb/types';
import { ExecFileProcessRunner } from './adb/ExecFileProcessRunner';
import { createAdbLocator } from './adb/locator/createAdbLocator';
import { CommandIds } from './commands/commandIds';
import { CopyValueCommand } from './commands/CopyValueCommand';
import { InspectCommand, OpenComponentSourceCommand, StopInspectingCommand } from './commands/InspectCommands';
import { OpenDeviceCommand } from './commands/OpenDeviceCommand';
import { RefreshDeviceInfoCommand } from './commands/RefreshDeviceInfoCommand';
import type { ICommand } from './commands/types';
import type { ILogger } from './core/types';
import { ActiveDeviceContext } from './device/ActiveDeviceContext';
import { AdbDeviceShell } from './device/AdbDeviceShell';
import { DeviceLeasePool } from './device/DeviceLeasePool';
import { DeviceInfoCollector } from './deviceInfo/DeviceInfoCollector';
import { DeviceInfoPoller } from './deviceInfo/DeviceInfoPoller';
import { DeviceInfoView } from './deviceInfo/DeviceInfoView';
import { CdpSession } from './inspector/CdpSession';
import { ComponentInspector } from './inspector/ComponentInspector';
import { ComponentView } from './inspector/ComponentView';
import { FetchHttpClient } from './inspector/FetchHttpClient';
import { InspectController } from './inspector/InspectController';
import { MetroClient } from './inspector/MetroClient';
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
import { MirrorSession } from './scrcpy/MirrorSession';
import { SCRCPY_SERVER_ASSET, SCRCPY_SERVER_VERSION } from './scrcpy/serverConstants';
import type { MirrorOptions } from './scrcpy/types';
import { ErrorPresenter } from './ui/ErrorPresenter';
import { QuickPickDevicePicker } from './ui/QuickPickDevicePicker';
import { StatusBarPresenter } from './ui/StatusBarPresenter';

const ADB_START_TIMEOUT_MS = 15_000;
const DEVICE_INFO_INTERVAL_MS = 5_000;
const COPY_FEEDBACK_MS = 2_000;
const METRO_TIMEOUT_MS = 3_000;
const INSPECTOR_TIMING = { pollIntervalMs: 30, pollAttempts: 50, timeoutMs: 5_000 };
const DEFAULT_METRO_PORT = 8081;

const MIRROR_OPTIONS: MirrorOptions = {
  maxSize: 1920,
  videoBitRate: 8_000_000,
  maxFps: 60,
};

const readAdbPathSetting = (): string | undefined =>
  vscode.workspace.getConfiguration('reflect').get<string>('adbPath');

const reflectSetting = <T>(key: string): T | undefined => vscode.workspace.getConfiguration('reflect').get<T>(key);

const readMetroPort = (): number => reflectSetting<number>('metroPort') ?? DEFAULT_METRO_PORT;

const readLocationSetting = (): MirrorLocation =>
  vscode.workspace.getConfiguration('reflect').get<MirrorLocation>('location') === 'editor' ? 'editor' : 'secondarySidebar';

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
  const activeDevice = new ActiveDeviceContext(tracker);
  const statusBar = new StatusBarPresenter(activeDevice, CommandIds.openDevice);
  const errors = new ErrorPresenter(CommandIds.openDevice, () => outputChannel.show());
  const serverBinary = new FileServerBinary(
    vscode.Uri.joinPath(context.extensionUri, SCRCPY_SERVER_ASSET).fsPath,
    SCRCPY_SERVER_VERSION,
  );
  const clipboard = {
    readText: () => Promise.resolve(vscode.env.clipboard.readText()),
    writeText: (text: string) => Promise.resolve(vscode.env.clipboard.writeText(text)),
  };
  const notify = (message: string): void => void vscode.window.setStatusBarMessage(`$(info) ${message}`, COPY_FEEDBACK_MS);
  const metro = new MetroClient(new FetchHttpClient(fetch, METRO_TIMEOUT_MS), readMetroPort);
  const componentView = new ComponentView();
  const inspectController = new InspectController({
    inspector: new ComponentInspector(
      metro,
      (url) => CdpSession.connect(url, metro.origins, (target, origin) => new WsSocket(target, origin), INSPECTOR_TIMING.timeoutMs),
      INSPECTOR_TIMING,
    ),
    mirrors: { setInspectMode: (active) => mirrors.setInspectMode(active) },
    view: componentView,
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
  };
  const sidebar = new MirrorViewProvider(context.extensionUri);
  const createSurface = (device: DeviceInfo, location: MirrorLocation): IMirrorSurface =>
    location === 'editor' ? new MirrorPanel(device, context.extensionUri) : sidebar.claim();
  const mirrors = new MirrorManager(
    (device, location) =>
      new MirrorController(
        device,
        createSurface(device, location),
        new MirrorSession(device, pool, launcher, serverBinary, MIRROR_OPTIONS, logger),
        mirrorServices,
      ),
  );
  const selection = new DeviceSelectionService(tracker, new QuickPickDevicePicker());
  const deviceInfoPoller = new DeviceInfoPoller(new DeviceInfoCollector(new AdbDeviceShell(pool)), DEVICE_INFO_INTERVAL_MS);
  const deviceInfoView = new DeviceInfoView(deviceInfoPoller, activeDevice, () => ({
    maskIpAddress: reflectSetting<boolean>('privacy.maskIpAddress') === true,
  }));

  context.subscriptions.push(
    outputChannel,
    tracker,
    activeDevice,
    statusBar,
    deviceInfoView,
    deviceInfoPoller,
    mirrors,
    sidebar,
    new SidebarResume(mirrors, sidebar.onDidChangeVisibility),
    vscode.window.registerWebviewViewProvider(MIRROR_VIEW_ID, sidebar),
    mirrors.onDidClose(() => activeDevice.setMirroredDevice(undefined)),
    mirrors.onDidClose(() => inspectController.cancel()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('reflect.privacy')) {
        deviceInfoView.refresh();
      }
    }),
    componentView,
    inspectController,
    pool,
  );

  registerCommands(context, [
    new OpenDeviceCommand(CommandIds.openDevice, readLocationSetting, selection, mirrors, activeDevice, errors),
    new OpenDeviceCommand(CommandIds.openDeviceInEditor, () => 'editor', selection, mirrors, activeDevice, errors),
    new RefreshDeviceInfoCommand(deviceInfoView),
    new InspectCommand(inspectController, () => mirrors.hasOpenMirror, () => Promise.resolve(vscode.commands.executeCommand(CommandIds.openDevice))),
    new StopInspectingCommand(inspectController),
    new OpenComponentSourceCommand(openSource),
    new CopyValueCommand(clipboard, (message) => void vscode.window.setStatusBarMessage(`$(check) ${message}`, COPY_FEEDBACK_MS)),
  ]);

  void tracker.start().catch((error: unknown) => logger.error('Device tracking unavailable', error));
}

export function deactivate(): void {}
