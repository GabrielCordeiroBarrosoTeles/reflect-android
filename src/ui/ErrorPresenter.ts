import * as vscode from 'vscode';
import type { ReflectError, ReflectErrorCode, SimulatorNotBootedError, XcodeUnsupportedError } from '../core/errors';
import { isReflectError } from '../core/errors';
import type { ErrorAction } from './types';

type ErrorHandler = (error: ReflectError) => Promise<void>;

const PLATFORM_TOOLS_URL = 'https://developer.android.com/tools/releases/platform-tools';
const USB_DEBUGGING_URL = 'https://developer.android.com/studio/debug/dev-options#enable';

export class ErrorPresenter {
  private readonly retryAction: ErrorAction = { title: 'Retry', run: () => this.retry() };

  private readonly handlers: Record<ReflectErrorCode, ErrorHandler> = {
    'adb-not-found': () =>
      this.show(
        'Reflect: adb not found. Install Android platform-tools or set "reflect.adbPath".',
        {
          title: 'Set adb path',
          run: () => Promise.resolve(vscode.commands.executeCommand('workbench.action.openSettings', 'reflect.adbPath')),
        },
        { title: 'Download platform-tools', run: () => this.openUrl(PLATFORM_TOOLS_URL) },
      ),
    'adb-server-unavailable': () =>
      this.show('Reflect: could not start the adb server. Run "adb start-server" in a terminal and try again.', this.retryAction),
    'no-device': () =>
      this.show(
        'Reflect: no Android device found. Connect it via USB and enable USB debugging.',
        { title: 'How to enable', run: () => this.openUrl(USB_DEBUGGING_URL) },
        this.retryAction,
      ),
    'device-unauthorized': () =>
      this.show('Reflect: device not authorized. Unlock the phone and accept the "Allow USB debugging" prompt.', this.retryAction),
    'device-offline': () =>
      this.show('Reflect: device is offline. Reconnect the USB cable or toggle USB debugging.', this.retryAction),
    'mirror-failed': () =>
      this.show(
        'Reflect: could not start mirroring on the device. Check the logs for details.',
        { title: 'Show logs', run: () => Promise.resolve(this.showLogs()) },
        this.retryAction,
      ),
    'metro-unavailable': () =>
      this.show('Reflect: Metro is not running. Start it with "npx expo start" or "npx react-native start" and try again.', {
        title: 'Set Metro port',
        run: () => Promise.resolve(vscode.commands.executeCommand('workbench.action.openSettings', 'reflect.metroPort')),
      }),
    'react-native-app-not-found': () =>
      this.show('Reflect: no debuggable React Native app found on the device. Open your app in development mode (React Native 0.76+).'),
    'ios-helper-unavailable': () => this.show("Reflect's iOS helper is missing. Reinstall the extension."),
    'xcode-unsupported': (error) => {
      const { xcodeVersion } = error as XcodeUnsupportedError;
      return this.show(`Reflect: ${xcodeVersion === undefined ? 'This Xcode' : `Xcode ${xcodeVersion}`} is not supported yet by Reflect.`);
    },
    'simulator-not-booted': (error) => this.show(`Reflect: ${(error as SimulatorNotBootedError).simulatorName} is not booted.`),
  };

  constructor(
    private readonly retryCommandId: string,
    private readonly showLogs: () => void,
  ) {}

  async present(error: unknown): Promise<void> {
    if (isReflectError(error)) {
      await this.handlers[error.code](error);
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`Reflect: ${message}`);
  }

  private async show(message: string, ...actions: ErrorAction[]): Promise<void> {
    const choice = await vscode.window.showErrorMessage(message, ...actions);
    await choice?.run();
  }

  private retry(): Promise<unknown> {
    return Promise.resolve(vscode.commands.executeCommand(this.retryCommandId));
  }

  private openUrl(url: string): Promise<unknown> {
    return Promise.resolve(vscode.env.openExternal(vscode.Uri.parse(url)));
  }
}
