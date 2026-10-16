import { describe, expect, it, vi } from 'vitest';
import {
  AdbNotFoundError,
  AdbServerUnavailableError,
  DeviceOfflineError,
  DeviceUnauthorizedError,
  MetroUnavailableError,
  MirrorStartError,
  NoDeviceError,
  ReactNativeAppNotFoundError,
} from '../../src/core/errors';
import { ErrorPresenter } from '../../src/ui/ErrorPresenter';
import { commands, env, window } from '../mocks/vscode';

const setup = (choice?: string) => {
  window.chooseErrorAction(choice);
  const showLogs = vi.fn();
  return { presenter: new ErrorPresenter('reflect.openDevice', showLogs), showLogs };
};

const lastMessage = () => window.showErrorMessage.mock.calls.at(-1)!;

describe('ErrorPresenter', () => {
  it.each([
    [new AdbServerUnavailableError(), 'could not start the adb server', ['Retry']],
    [new NoDeviceError(), 'no Android device found', ['How to enable', 'Retry']],
    [new DeviceUnauthorizedError('S'), 'device not authorized', ['Retry']],
    [new DeviceOfflineError('S'), 'device is offline', ['Retry']],
    [new MirrorStartError('S', []), 'could not start mirroring', ['Show logs', 'Retry']],
    [new AdbNotFoundError([]), 'adb not found', ['Set adb path', 'Download platform-tools']],
    [new MetroUnavailableError(8081), 'Metro is not running', ['Set Metro port']],
    [new ReactNativeAppNotFoundError('Pixel'), 'no debuggable React Native app', []],
  ])('explains %s with actions', async (error, text, actions) => {
    const { presenter } = setup();
    await presenter.present(error);
    const [message, ...items] = lastMessage();
    expect(message).toContain(text);
    expect(items.map((item) => item.title)).toEqual(actions);
  });

  it('retries through the open command', async () => {
    const { presenter } = setup('Retry');
    await presenter.present(new DeviceOfflineError('S'));
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.openDevice');
  });

  it('opens the USB debugging guide', async () => {
    const { presenter } = setup('How to enable');
    await presenter.present(new NoDeviceError());
    expect(env.openExternal).toHaveBeenCalledWith(expect.objectContaining({ fsPath: expect.stringContaining('dev-options') }));
  });

  it('opens the adb path setting and the platform-tools download', async () => {
    await setup('Set adb path').presenter.present(new AdbNotFoundError([]));
    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'reflect.adbPath');
    await setup('Download platform-tools').presenter.present(new AdbNotFoundError([]));
    expect(env.openExternal).toHaveBeenCalledWith(expect.objectContaining({ fsPath: expect.stringContaining('platform-tools') }));
  });

  it('opens the Metro port setting', async () => {
    await setup('Set Metro port').presenter.present(new MetroUnavailableError(8081));
    expect(commands.executeCommand).toHaveBeenCalledWith('workbench.action.openSettings', 'reflect.metroPort');
  });

  it('shows the logs', async () => {
    const { presenter, showLogs } = setup('Show logs');
    await presenter.present(new MirrorStartError('S', []));
    expect(showLogs).toHaveBeenCalledOnce();
  });

  it('does nothing when the user dismisses the message', async () => {
    const { presenter } = setup(undefined);
    await presenter.present(new DeviceOfflineError('S'));
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });

  it('shows generic errors and non-error values', async () => {
    const { presenter } = setup();
    await presenter.present(new Error('unexpected'));
    expect(lastMessage()).toEqual(['Reflect: unexpected']);
    await presenter.present('text failure');
    expect(lastMessage()).toEqual(['Reflect: text failure']);
  });
});
