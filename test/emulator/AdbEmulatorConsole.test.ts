import { describe, expect, it, vi } from 'vitest';
import { AdbEmulatorConsole } from '../../src/emulator/AdbEmulatorConsole';
import type { EmulatorExecFile } from '../../src/emulator/types';

const locator = { locate: () => Promise.resolve('/sdk/platform-tools/adb') };

const replying = (stdout: string, error: Error | null = null) =>
  vi.fn<EmulatorExecFile>((_file, _args, _options, callback) => {
    callback(error, stdout);
    return undefined;
  });

describe('AdbEmulatorConsole', () => {
  it('runs adb emu for the serial with the timeout and returns the reply without OK', async () => {
    const execFile = replying('windowtype=qtwindow\r\nOK\r\n');
    await expect(new AdbEmulatorConsole(locator, execFile, 5_000).run('emulator-5554', ['avd', 'windowtype'])).resolves.toBe('windowtype=qtwindow');
    expect(execFile).toHaveBeenCalledWith('/sdk/platform-tools/adb', ['-s', 'emulator-5554', 'emu', 'avd', 'windowtype'], { timeout: 5_000 }, expect.any(Function));
  });

  it('keeps multi-line replies', async () => {
    await expect(new AdbEmulatorConsole(locator, replying('a\r\nb\r\nOK\r\n'), 1).run('emulator-5554', ['x'])).resolves.toBe('a\nb');
  });

  it('rejects with the console error when the command is refused', async () => {
    const console = new AdbEmulatorConsole(locator, replying('usage\r\nKO:  bad sub-command\r\n'), 1);
    await expect(console.run('emulator-5554', ['avd', 'bogus'])).rejects.toThrow('Emulator console: bad sub-command');
  });

  it('rejects when adb fails', async () => {
    const console = new AdbEmulatorConsole(locator, replying('', new Error('could not connect to TCP port 5556')), 1);
    await expect(console.run('emulator-5556', ['avd', 'name'])).rejects.toThrow('could not connect to TCP port 5556');
  });

  it('rejects when adb cannot be located', async () => {
    const missing = { locate: () => Promise.reject(new Error('adb not found')) };
    await expect(new AdbEmulatorConsole(missing, replying(''), 1).run('emulator-5554', ['avd', 'name'])).rejects.toThrow('adb not found');
  });
});
