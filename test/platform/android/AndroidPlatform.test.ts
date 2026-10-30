import { describe, expect, it, vi } from 'vitest';
import { GENERIC_FRAME } from '../../../src/shared/deviceFrame';
import { AndroidPlatform } from '../../../src/platform/android/AndroidPlatform';
import { MirrorSession } from '../../../src/scrcpy/MirrorSession';
import type { IServerBinary } from '../../../src/scrcpy/types';
import { device } from '../../fakes/devices';
import { FakeLeasePool } from '../../fakes/FakeLeasePool';
import { FakeLogger } from '../../fakes/FakeLogger';
import { FakeScrcpyLauncher } from '../../fakes/FakeScrcpyClient';

const emulator = device({ id: 'emulator-5554', kind: 'emulator', name: 'sdk gphone64 arm64' });

describe('AndroidPlatform', () => {
  const build = (hide = vi.fn(() => Promise.resolve())): AndroidPlatform =>
    new AndroidPlatform(
      new FakeLeasePool(),
      new FakeScrcpyLauncher(),
      { version: '1', open: () => Promise.reject(new Error('unused')) } satisfies IServerBinary,
      { maxSize: 1, videoBitRate: 1, maxFps: 1 },
      new FakeLogger(),
      { hide },
    );

  it('declares every action and tab', () => {
    const capabilities = build().capabilities(device());
    expect(capabilities.actions).toContain('reverseMetro');
    expect(capabilities.tools).toContain('logs');
    expect(capabilities.tools).toHaveLength(7);
  });

  it('keeps exactly the original Android actions and never offers the iOS-only clean status bar', () => {
    const { actions } = build().capabilities(device());
    expect(actions).toEqual(['back', 'home', 'recents', 'rotate', 'screenPower', 'screenshot', 'record', 'devMenu', 'reload', 'reverseMetro']);
    expect(actions).not.toContain('cleanStatusBar');
  });

  it('does not accept drops and never offers adding files', () => {
    const capabilities = build().capabilities(device());
    expect(capabilities.acceptsDrops).toBe(false);
    expect(capabilities.actions).not.toContain('addFiles');
  });

  it('keeps the cable-oriented reconnect copy for physical devices', () => {
    expect(build().capabilities(device()).copy).toEqual({
      reconnecting: 'Reconnecting… plug the cable back in',
      gaveUp: 'Device not found. Check the cable and USB debugging.',
    });
  });

  it('gives emulators the same features with emulator copy', () => {
    const capabilities = build().capabilities(emulator);
    expect(capabilities.actions).toEqual(build().capabilities(device()).actions);
    expect(capabilities.tools).toHaveLength(7);
    expect(capabilities.copy).toEqual({
      reconnecting: 'Emulator stopped — it will reconnect when it starts again',
      gaveUp: 'Emulator not found. Start it from Android Studio or with the emulator command.',
    });
  });

  it('decodes the scrcpy stream with the hardware decoder', () => {
    expect(build().capabilities(device()).videoDecoder).toBe('hardware');
  });

  it('frames every device with the generic look the webview used before frames existed', () => {
    expect(build().frame()).toEqual({ screenCornerRadius: 0.075, bezel: 0.027, chin: 0 });
    expect(build().frame()).toBe(GENERIC_FRAME);
  });

  it('creates a scrcpy mirror session', () => {
    expect(build().createMirrorSession(device())).toBeInstanceOf(MirrorSession);
  });

  it('hides the emulator window once its mirror streams', async () => {
    const hide = vi.fn(() => Promise.resolve());
    const session = build(hide).createMirrorSession(emulator);
    expect(hide).not.toHaveBeenCalled();
    await session.start();
    session.dispose();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(hide).toHaveBeenCalledWith('emulator-5554');
  });

  it('never touches windows for physical devices', async () => {
    const hide = vi.fn(() => Promise.resolve());
    await build(hide).createMirrorSession(device()).start();
    expect(hide).not.toHaveBeenCalled();
  });
});
