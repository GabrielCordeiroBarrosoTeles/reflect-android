import { AndroidKeyCode } from '@yume-chan/scrcpy';
import { describe, expect, it, vi } from 'vitest';
import { DEVICE_ACTIONS } from '../../src/actions/deviceActions';
import type { ActionContext } from '../../src/actions/types';
import { deviceInfo } from '../fakes/devices';
import { FakeDeviceControl } from '../fakes/FakeMirrorSession';

const setup = (reloaded = true) => {
  const control = new FakeDeviceControl();
  const mirror = { takeScreenshot: vi.fn(() => Promise.resolve()), toggleRecording: vi.fn(() => Promise.resolve()), toggleScreenPower: vi.fn(() => Promise.resolve()) };
  const services = { reloadApp: vi.fn(() => Promise.resolve(reloaded)), reverseMetro: vi.fn(() => Promise.resolve(8081)), notify: vi.fn() };
  const context: ActionContext = { device: deviceInfo(), control, mirror, services };
  return { control, mirror, services, context };
};

describe('DEVICE_ACTIONS', () => {
  it.each([
    ['back', 'back'],
    ['home', 'home'],
    ['recents', 'recents'],
    ['rotate', 'rotate'],
  ] as const)('%s uses the device control', async (id, method) => {
    const { control, context } = setup();
    await DEVICE_ACTIONS[id](context);
    expect(control.calls).toEqual([{ method }]);
  });

  it('opens the React Native dev menu with the menu key', async () => {
    const { control, context } = setup();
    await DEVICE_ACTIONS.devMenu(context);
    expect(control.calls).toEqual([{ method: 'press', arg: AndroidKeyCode.ContextMenu }]);
  });

  it.each([
    ['screenshot', 'takeScreenshot'],
    ['record', 'toggleRecording'],
    ['screenPower', 'toggleScreenPower'],
  ] as const)('%s delegates to the mirror', async (id, method) => {
    const { mirror, context } = setup();
    await DEVICE_ACTIONS[id](context);
    expect(mirror[method]).toHaveBeenCalledOnce();
  });

  it('reloads through the debugger and falls back to pressing R twice', async () => {
    const debuggerReload = setup(true);
    await DEVICE_ACTIONS.reload(debuggerReload.context);
    expect(debuggerReload.control.calls).toEqual([]);
    const fallback = setup(false);
    await DEVICE_ACTIONS.reload(fallback.context);
    expect(fallback.control.calls).toEqual([
      { method: 'press', arg: AndroidKeyCode.KeyR },
      { method: 'press', arg: AndroidKeyCode.KeyR },
    ]);
  });

  it('reverses the Metro port and confirms it', async () => {
    const { services, context } = setup();
    await DEVICE_ACTIONS.reverseMetro(context);
    expect(services.reverseMetro).toHaveBeenCalledWith(context.device);
    expect(services.notify).toHaveBeenCalledWith('adb reverse tcp:8081 is active');
  });
});
