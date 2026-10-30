import { describe, expect, it, vi } from 'vitest';
import { EmulatorWindows } from '../../src/emulator/EmulatorWindows';
import type { IAppVisibility, IEmulatorConsole } from '../../src/emulator/types';
import { FakeLogger } from '../fakes/FakeLogger';

const DISCOVERY_PATH = '/Users/me/Library/Caches/TemporaryItems/avd/running/pid_47899.ini';

class FakeConsole implements IEmulatorConsole {
  readonly calls: string[] = [];
  windowType = 'windowtype=qtwindow';
  discoveryPath = DISCOVERY_PATH;
  failure: Error | undefined;

  run(serial: string, args: readonly string[]): Promise<string> {
    this.calls.push(`${serial} ${args.join(' ')}`);
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    return Promise.resolve(args[1] === 'windowtype' ? this.windowType : this.discoveryPath);
  }
}

class FakeApps implements IAppVisibility {
  readonly calls: string[] = [];
  failure: Error | undefined;

  hide(pid: number): Promise<void> {
    return this.record(`hide ${pid}`);
  }

  unhide(pid: number): Promise<void> {
    return this.record(`unhide ${pid}`);
  }

  private record(call: string): Promise<void> {
    this.calls.push(call);
    return this.failure ? Promise.reject(this.failure) : Promise.resolve();
  }
}

const setup = (mode: unknown = 'hide') => {
  const console = new FakeConsole();
  const apps = new FakeApps();
  const logger = new FakeLogger();
  const windows = new EmulatorWindows(() => mode, console, apps, logger);
  const changes = vi.fn();
  windows.onDidChange(changes);
  return { console, apps, logger, windows, changes };
};

describe('EmulatorWindows', () => {
  it('hides the qemu process of the emulator found through the console', async () => {
    const { windows, console, apps, changes, logger } = setup();
    await windows.hide('emulator-5554');
    expect(console.calls).toEqual(['emulator-5554 avd windowtype', 'emulator-5554 avd discoverypath']);
    expect(apps.calls).toEqual(['hide 47899']);
    expect(windows.isHidden('emulator-5554')).toBe(true);
    expect(windows.isHidden('emulator-5556')).toBe(false);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(logger.infos).toEqual(['Emulator window of emulator-5554: hide']);
  });

  it('hides by default when the setting is missing or unknown', async () => {
    const { windows, apps } = setup('bogus');
    await windows.hide('emulator-5554');
    expect(apps.calls).toEqual(['hide 47899']);
  });

  it('leaves the window alone in leave mode', async () => {
    const { windows, console, apps, changes } = setup('leave');
    await windows.hide('emulator-5554');
    expect(console.calls).toEqual([]);
    expect(apps.calls).toEqual([]);
    expect(windows.isHidden('emulator-5554')).toBe(false);
    expect(changes).not.toHaveBeenCalled();
  });

  it('skips emulators that run without a window', async () => {
    const { windows, console, apps, logger } = setup();
    console.windowType = 'windowtype=headless';
    await windows.hide('emulator-5554');
    expect(apps.calls).toEqual([]);
    expect(windows.isHidden('emulator-5554')).toBe(false);
    expect(logger.infos).toContain('Emulator emulator-5554 has no window to hide');
  });

  it('logs instead of failing when the window cannot be hidden', async () => {
    const { windows, console, logger, changes } = setup();
    console.discoveryPath = '/somewhere/else.ini';
    await windows.hide('emulator-5554');
    expect(logger.errors).toEqual([{ message: 'Could not hide the window of emulator-5554', error: new Error('No emulator process for emulator-5554') }]);
    expect(windows.isHidden('emulator-5554')).toBe(false);
    expect(changes).not.toHaveBeenCalled();
  });

  it('shows a hidden emulator window again', async () => {
    const { windows, apps, changes } = setup();
    await windows.hide('emulator-5554');
    await windows.show('emulator-5554');
    expect(apps.calls).toEqual(['hide 47899', 'unhide 47899']);
    expect(windows.isHidden('emulator-5554')).toBe(false);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('lets show failures reach the caller and keeps the window marked hidden', async () => {
    const { windows, apps } = setup();
    await windows.hide('emulator-5554');
    apps.failure = new Error('No app with pid 47899');
    await expect(windows.show('emulator-5554')).rejects.toThrow('No app with pid 47899');
    expect(windows.isHidden('emulator-5554')).toBe(true);
  });

  it('forgets emulators that are no longer connected', async () => {
    const { windows, changes } = setup();
    await windows.hide('emulator-5554');
    await windows.hide('emulator-5556');
    windows.retain(['emulator-5556', 'R5CX123']);
    expect(windows.isHidden('emulator-5554')).toBe(false);
    expect(windows.isHidden('emulator-5556')).toBe(true);
    expect(changes).toHaveBeenCalledTimes(3);
    windows.retain(['emulator-5556']);
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('stops notifying once disposed', async () => {
    const { windows, changes } = setup();
    windows.dispose();
    await windows.hide('emulator-5554');
    expect(changes).not.toHaveBeenCalled();
  });
});
