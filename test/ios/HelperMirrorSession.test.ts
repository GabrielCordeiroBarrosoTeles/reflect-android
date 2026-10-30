import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MirrorStartError, SimulatorNotBootedError, XcodeUnsupportedError } from '../../src/core/errors';
import type { Device } from '../../src/devices/types';
import { Emitter } from '../../src/core/Emitter';
import { HelperMirrorSession } from '../../src/ios/HelperMirrorSession';
import { SimulatorPasteboard } from '../../src/ios/SimulatorPasteboard';
import type { ISimctl } from '../../src/ios/types';
import type { SessionStateChange } from '../../src/platform/types';
import type { VideoConfig, VideoPacket } from '../../src/shared/protocol';
import { FakeDeviceControl } from '../fakes/FakeMirrorSession';
import { FakeHelperProcess, HELLO } from '../fakes/FakeHelperProcess';
import { FakeLogger } from '../fakes/FakeLogger';

const device: Device = {
  id: 'UDID-1',
  platform: 'ios',
  kind: 'simulator',
  name: 'iPhone 15',
  model: undefined,
  detail: undefined,
  state: 'ready',
};

const setup = (pbpaste: () => Promise<string> = () => Promise.resolve('')) => {
  const helper = new FakeHelperProcess();
  const spawn = vi.fn(() => Promise.resolve(helper));
  const control = new FakeDeviceControl();
  const createControl = vi.fn(() => control);
  const logger = new FakeLogger();
  const simctl: ISimctl = { run: vi.fn(pbpaste) };
  const pasteboard = new SimulatorPasteboard(simctl, device.id);
  const onStreaming = vi.fn();
  const availabilityEmitter = new Emitter<void>();
  const availability = { ready: true, onDidChange: availabilityEmitter.event, isReady: vi.fn((_serial: string) => availability.ready) };
  const session = new HelperMirrorSession(device, { spawn, createControl, logger, pasteboard, availability, onStreaming });
  const states: SessionStateChange[] = [];
  const configs: VideoConfig[] = [];
  const packets: VideoPacket[] = [];
  const clipboard: string[] = [];
  session.onDidChangeState((change) => states.push(change));
  session.onDidChangeVideoConfig((config) => configs.push(config));
  session.onVideoPacket((packet) => packets.push(packet));
  session.onDeviceClipboard((text) => clipboard.push(text));
  return { session, helper, spawn, control, createControl, logger, simctl, pasteboard, onStreaming, states, configs, packets, clipboard, availability, availabilityEmitter };
};

const startStreaming = async (context: ReturnType<typeof setup>) => {
  const started = context.session.start();
  await vi.advanceTimersByTimeAsync(0);
  context.helper.hello();
  context.helper.config(884, 1920);
  context.helper.frame(true, 10);
  await started;
};

describe('HelperMirrorSession', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('streams after hello, config and the first frame', async () => {
    const context = setup();
    expect(context.session.state).toBe('idle');
    await startStreaming(context);
    expect(context.spawn).toHaveBeenCalledWith('UDID-1');
    expect(context.states.map((change) => change.state)).toEqual(['connecting', 'streaming']);
    expect(context.session.state).toBe('streaming');
    expect(context.configs).toEqual([{ codec: ScrcpyVideoCodecId.H264, width: 884, height: 1920 }]);
    expect(context.session.videoConfig).toEqual(context.configs[0]);
    expect(context.packets).toEqual([
      { kind: 'configuration', data: new Uint8Array([0, 0, 0, 1, 0x67]), keyframe: undefined, pts: undefined },
      { kind: 'data', data: new Uint8Array([0, 0, 0, 1, 0x65]), keyframe: true, pts: 10 },
    ]);
    context.session.dispose();
  });

  it('hands a sender for the helper to the streaming hook, once', async () => {
    const context = setup();
    await startStreaming(context);
    context.helper.frame(false, 11);
    expect(context.onStreaming).toHaveBeenCalledOnce();
    const [send] = context.onStreaming.mock.calls[0] as [(command: unknown) => void];
    send({ type: 'simulatorApp', action: 'hide' });
    expect(context.helper.sent).toContainEqual({ type: 'simulatorApp', action: 'hide' });
    context.session.dispose();
  });

  it('fires the video config only when the size changes but forwards every configuration', async () => {
    const context = setup();
    await startStreaming(context);
    context.helper.config(884, 1920);
    context.helper.config(884, 1920);
    context.helper.config(1920, 884);
    context.helper.config(1920, 900);
    expect(context.configs.map(({ width, height }) => [width, height])).toEqual([[884, 1920], [1920, 884], [1920, 900]]);
    expect(context.packets.filter((packet) => packet.kind === 'configuration')).toHaveLength(5);
    context.session.dispose();
  });

  it('ignores a second start while connecting', async () => {
    const context = setup();
    const first = context.session.start();
    await context.session.start();
    expect(context.spawn).toHaveBeenCalledTimes(1);
    context.session.dispose();
    await first;
  });

  it('uses a no-op control until hello, then the created control', async () => {
    const context = setup();
    const { control } = context.session;
    const started = context.session.start();
    await vi.advanceTimersByTimeAsync(0);
    for (const call of [
      control.touch({ action: 'down', x: 0, y: 0, pointerId: 1 } as never),
      control.scroll({} as never),
      control.key({} as never),
      control.text('a'),
      control.paste('a'),
      control.pressButton('home'),
      control.rotate(),
      control.setScreenPower(true),
    ]) {
      await expect(call).resolves.toBeUndefined();
    }
    context.helper.hello();
    expect(context.createControl).toHaveBeenCalledWith(expect.any(Function), HELLO);
    await control.rotate();
    expect(context.control.calls).toEqual([{ method: 'rotate' }]);
    const send = (context.createControl.mock.calls[0] as unknown as [(command: object) => void])[0];
    send({ type: 'rotate' });
    expect(context.helper.sent).toEqual([{ type: 'rotate' }]);
    context.session.dispose();
    await started;
    send({ type: 'rotate' });
    expect(context.helper.sent).toHaveLength(1);
  });

  it.each([
    ['device-not-booted', SimulatorNotBootedError],
    ['device-not-found', SimulatorNotBootedError],
    ['xcode-unsupported', XcodeUnsupportedError],
    ['framework-unavailable', XcodeUnsupportedError],
    ['something-else', MirrorStartError],
  ])('rejects start for helper error %s', async (code, errorClass) => {
    const context = setup();
    const started = context.session.start();
    const failure = started.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    context.helper.event({ type: 'error', code, message: 'detail' });
    expect(await failure).toBeInstanceOf(errorClass);
    expect(context.session.state).toBe('error');
    expect(context.helper.disposed).toBe(true);
  });

  it('carries the helper message and simulator name in the errors', async () => {
    const booted = setup();
    const bootedFailure = booted.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    booted.helper.event({ type: 'error', code: 'device-not-booted' });
    expect(((await bootedFailure) as SimulatorNotBootedError).simulatorName).toBe('iPhone 15');
    const xcode = setup();
    const xcodeFailure = xcode.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    xcode.helper.event({ type: 'error', code: 'xcode-unsupported', message: 'Xcode 25' });
    expect(((await xcodeFailure) as XcodeUnsupportedError).missing).toEqual(['Xcode 25']);
  });

  it('rejects when the helper exits before streaming', async () => {
    const context = setup();
    const failure = context.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    context.helper.exit(2);
    expect(await failure).toBeInstanceOf(MirrorStartError);
    expect(context.session.state).toBe('error');
    context.helper.exit(null);
    expect(context.session.state).toBe('error');
    const silent = setup();
    const silentFailure = silent.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    silent.helper.exit(null);
    expect(((await silentFailure) as MirrorStartError).message).toContain('UDID-1');
  });

  it('kills the helper and rejects when no frame arrives within 15 seconds', async () => {
    const context = setup();
    const failure = context.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(context.session.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(1);
    expect(await failure).toBeInstanceOf(MirrorStartError);
    expect(context.session.state).toBe('error');
    expect(context.helper.disposed).toBe(true);
  });

  it('maps a spawn failure to a start error and keeps reflect errors as they are', async () => {
    const context = setup();
    context.spawn.mockRejectedValueOnce(new Error('boom'));
    await expect(context.session.start()).rejects.toBeInstanceOf(MirrorStartError);
    expect(context.logger.errors[0]?.message).toContain('UDID-1');
    const missing = setup();
    const unavailable = new SimulatorNotBootedError('x');
    missing.spawn.mockRejectedValueOnce(unavailable);
    await expect(missing.session.start()).rejects.toBe(unavailable);
  });

  it('disposes a helper that spawns after the session was disposed, without rejecting', async () => {
    const context = setup();
    let release: (helper: FakeHelperProcess) => void = () => undefined;
    context.spawn.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const started = context.session.start();
    context.session.dispose();
    release(context.helper);
    await expect(started).resolves.toBeUndefined();
    expect(context.helper.disposed).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(context.session.state).toBe('closed');
  });

  it('ignores late events from a previous helper after a retry', async () => {
    const context = setup();
    const failure = context.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    const old = context.helper;
    old.event({ type: 'error', code: 'device-not-booted' });
    await failure;
    const next = new FakeHelperProcess();
    context.spawn.mockResolvedValueOnce(next);
    const retry = context.session.start();
    await vi.advanceTimersByTimeAsync(0);
    old.exit(2);
    old.frame();
    old.event({ type: 'error', code: 'device-not-booted' });
    expect(context.session.state).toBe('connecting');
    next.hello();
    next.frame();
    await retry;
    old.exit(2);
    expect(context.session.state).toBe('streaming');
    expect(context.packets).toHaveLength(1);
    context.session.dispose();
  });

  it('shows the xcode version from hello and no detail when the helper sent none', async () => {
    const context = setup();
    const failure = context.session.start().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    context.helper.hello();
    context.helper.event({ type: 'error', code: 'xcode-unsupported' });
    const error = (await failure) as XcodeUnsupportedError;
    expect(error.xcodeVersion).toBe('26.6');
    expect(error.missing).toEqual([]);
    expect(error.message).toBe('Xcode 26.6 is not supported');
  });

  it('can start again after a failure', async () => {
    const context = setup();
    context.spawn.mockRejectedValueOnce(new Error('boom'));
    await context.session.start().catch(() => undefined);
    await startStreaming(context);
    expect(context.session.state).toBe('streaming');
    context.session.dispose();
  });

  it('logs warnings, ignores other events and only logs errors once streaming', async () => {
    const context = setup();
    await startStreaming(context);
    context.helper.event({ type: 'warning', message: 'unknown command x' });
    context.helper.event({ type: 'warning' });
    context.helper.event({ type: 'orientation-changed' });
    context.helper.event({ type: 'error' });
    context.helper.frame(false, 20);
    context.helper.event({ type: 'error', code: 'framework-unavailable', message: 'input broken' });
    expect(context.logger.infos).toContain('[ios-helper] warning: unknown command x');
    expect(context.logger.infos).toContain('[ios-helper] warning: ');
    expect(context.logger.errors.at(-1)?.message).toContain('input broken');
    expect(context.session.state).toBe('streaming');
    context.session.dispose();
  });

  it('becomes disconnected when the helper exits while streaming', async () => {
    const context = setup();
    await startStreaming(context);
    context.helper.exit(null);
    expect(context.session.state).toBe('disconnected');
    expect(context.helper.disposed).toBe(true);
    expect(context.logger.infos.at(-1)).toContain('code null');
    await context.session.requestKeyframe();
    expect(context.helper.sent).toEqual([]);
    context.helper.exit(1);
    context.session.dispose();
  });

  it('sends keyframe requests', async () => {
    const context = setup();
    await startStreaming(context);
    await context.session.requestKeyframe();
    expect(context.helper.sent).toEqual([{ type: 'keyframe' }]);
    context.session.dispose();
  });

  it('disposes the helper once and ignores late output', async () => {
    const context = setup();
    await startStreaming(context);
    context.session.dispose();
    context.session.dispose();
    expect(context.helper.disposed).toBe(true);
    expect(context.session.state).toBe('closed');
    const before = context.packets.length;
    context.helper.frame();
    context.helper.exit(0);
    expect(context.packets).toHaveLength(before);
    expect(context.states.at(-1)?.state).toBe('closed');
  });

  describe('clipboard', () => {
    it('fires only when the simulator pasteboard changes after the baseline', async () => {
      let text = 'initial';
      const context = setup(() => Promise.resolve(text));
      await startStreaming(context);
      await vi.advanceTimersByTimeAsync(1000);
      expect(context.simctl.run).toHaveBeenCalledWith(['pbpaste', 'UDID-1']);
      expect(context.clipboard).toEqual([]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(context.clipboard).toEqual([]);
      text = 'copied';
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);
      text = '';
      await vi.advanceTimersByTimeAsync(1000);
      expect(context.clipboard).toEqual(['copied']);
      context.session.dispose();
    });

    it('keeps polling after a pbpaste failure', async () => {
      let fail = true;
      const context = setup(() => (fail ? Promise.reject(new Error('x')) : Promise.resolve('a')));
      await startStreaming(context);
      await vi.advanceTimersByTimeAsync(1000);
      fail = false;
      await vi.advanceTimersByTimeAsync(2000);
      expect(context.simctl.run).toHaveBeenCalledTimes(3);
      context.session.dispose();
    });

    it('stops polling on dispose and on disconnect', async () => {
      const context = setup(() => Promise.resolve('a'));
      await startStreaming(context);
      await vi.advanceTimersByTimeAsync(1000);
      context.helper.exit(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(context.simctl.run).toHaveBeenCalledTimes(1);

      const second = setup(() => Promise.resolve('a'));
      await startStreaming(second);
      second.session.dispose();
      await vi.advanceTimersByTimeAsync(5000);
      expect(second.simctl.run).not.toHaveBeenCalled();
    });

    it('does not fire or reschedule when a poll settles after the stream ended', async () => {
      let resolvePoll: (text: string) => void = () => undefined;
      let calls = 0;
      const context = setup(() => {
        calls += 1;
        return calls === 1 ? Promise.resolve('a') : new Promise<string>((resolve) => (resolvePoll = resolve));
      });
      await startStreaming(context);
      await vi.advanceTimersByTimeAsync(2000);
      context.helper.exit(1);
      resolvePoll('b');
      await vi.advanceTimersByTimeAsync(5000);
      expect(context.clipboard).toEqual([]);
      expect(context.simctl.run).toHaveBeenCalledTimes(2);
    });
  });

  describe('simulator availability', () => {
    it('tears the helper down and disconnects when discovery reports the simulator not ready', async () => {
      const context = setup();
      await startStreaming(context);
      context.availabilityEmitter.fire();
      expect(context.session.state).toBe('streaming');
      context.availability.ready = false;
      context.availabilityEmitter.fire();
      expect(context.availability.isReady).toHaveBeenCalledWith('UDID-1');
      expect(context.helper.disposed).toBe(true);
      expect(context.session.state).toBe('disconnected');
      expect(context.states.at(-1)).toEqual({ state: 'disconnected' });
      expect(context.logger.infos.some((line) => line.includes('no longer booted'))).toBe(true);
      context.session.dispose();
    });

    it('ignores availability changes while not streaming and after dispose', async () => {
      const context = setup();
      context.availability.ready = false;
      context.availabilityEmitter.fire();
      expect(context.session.state).toBe('idle');
      expect(context.availability.isReady).not.toHaveBeenCalled();
      context.session.dispose();
      context.availabilityEmitter.fire();
      expect(context.session.state).toBe('closed');
    });

    it('streams again on a new start after an availability disconnect', async () => {
      const context = setup();
      await startStreaming(context);
      context.availability.ready = false;
      context.availabilityEmitter.fire();
      context.availability.ready = true;
      const next = new FakeHelperProcess();
      context.spawn.mockResolvedValueOnce(next);
      const started = context.session.start();
      await vi.advanceTimersByTimeAsync(0);
      next.hello();
      next.config(884, 1920);
      next.frame(true, 1);
      await started;
      expect(context.session.state).toBe('streaming');
      context.session.dispose();
    });
  });

  it('forwards pasteboard changes only while streaming', async () => {
    let text = 'base';
    const context = setup(() => Promise.resolve(text));
    await context.pasteboard.poll();
    text = 'early';
    await context.pasteboard.poll();
    expect(context.clipboard).toEqual([]);
    await startStreaming(context);
    text = 'late';
    await context.pasteboard.poll();
    expect(context.clipboard).toEqual(['late']);
    context.session.dispose();
  });
});
