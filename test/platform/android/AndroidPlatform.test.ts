import { describe, expect, it } from 'vitest';
import { AndroidPlatform } from '../../../src/platform/android/AndroidPlatform';
import { MirrorSession } from '../../../src/scrcpy/MirrorSession';
import type { IServerBinary } from '../../../src/scrcpy/types';
import { device } from '../../fakes/devices';
import { FakeLeasePool } from '../../fakes/FakeLeasePool';
import { FakeLogger } from '../../fakes/FakeLogger';
import { FakeScrcpyLauncher } from '../../fakes/FakeScrcpyClient';

describe('AndroidPlatform', () => {
  const build = (): AndroidPlatform =>
    new AndroidPlatform(
      new FakeLeasePool(),
      new FakeScrcpyLauncher(),
      { version: '1', open: () => Promise.reject(new Error('unused')) } satisfies IServerBinary,
      { maxSize: 1, videoBitRate: 1, maxFps: 1 },
      new FakeLogger(),
    );

  it('declares every action and tab', () => {
    const capabilities = build().capabilities();
    expect(capabilities.actions).toContain('reverseMetro');
    expect(capabilities.tools).toContain('logs');
    expect(capabilities.tools).toHaveLength(7);
  });

  it('keeps the cable-oriented reconnect copy', () => {
    expect(build().capabilities().copy).toEqual({
      reconnecting: 'Reconnecting… plug the cable back in',
      gaveUp: 'Device not found. Check the cable and USB debugging.',
    });
  });

  it('decodes the scrcpy stream with the hardware decoder', () => {
    expect(build().capabilities().videoDecoder).toBe('hardware');
  });

  it('creates a scrcpy mirror session', () => {
    expect(build().createMirrorSession(device())).toBeInstanceOf(MirrorSession);
  });
});
