import { AdbScrcpyExitedError } from '@yume-chan/adb-scrcpy';
import { describe, expect, it, vi } from 'vitest';
import { MirrorStartError, NoDeviceError } from '../../src/core/errors';
import { MirrorSession } from '../../src/scrcpy/MirrorSession';
import type { IServerBinary } from '../../src/scrcpy/types';
import type { SessionStateKind, VideoPacket } from '../../src/shared/protocol';
import { deviceInfo } from '../fakes/devices';
import { FakeLeasePool } from '../fakes/FakeLeasePool';
import { FakeLogger } from '../fakes/FakeLogger';
import { FakeScrcpyLauncher } from '../fakes/FakeScrcpyClient';
import { flushPromises } from '../fakes/PushStream';

const binary: IServerBinary = { version: '3.3.3', open: () => Promise.reject(new Error('unused')) };
const options = { maxSize: 1920, videoBitRate: 8_000_000, maxFps: 60 };

const setup = () => {
  const pool = new FakeLeasePool();
  const launcher = new FakeScrcpyLauncher();
  const logger = new FakeLogger();
  const session = new MirrorSession(deviceInfo(), pool, launcher, binary, options, logger);
  const states: SessionStateKind[] = [];
  session.onDidChangeState((change) => states.push(change.state));
  return { pool, launcher, logger, session, states, client: launcher.client, adb: pool.adb };
};

describe('MirrorSession', () => {
  it('launches scrcpy on the selected device and starts streaming', async () => {
    const { session, states, launcher, pool } = setup();
    const configs: unknown[] = [];
    session.onDidChangeVideoConfig((config) => configs.push(config));
    await session.start();
    expect(pool.acquired).toEqual(['R5CX123']);
    expect(launcher.launches[0]?.options).toBe(options);
    expect(states).toEqual(['connecting', 'streaming']);
    expect(session.state).toBe('streaming');
    expect(configs).toEqual([{ codec: 0x68323634, width: 1080, height: 2400 }]);
    expect(session.videoConfig).toEqual(configs[0]);
  });

  it('defaults unknown video dimensions to zero', async () => {
    const { session, client } = setup();
    client.metadata = { codec: 1 };
    await session.start();
    expect(session.videoConfig).toEqual({ codec: 1, width: 0, height: 0 });
  });

  it('ignores start while already running', async () => {
    const { session, launcher } = setup();
    await session.start();
    await session.start();
    expect(launcher.launches).toHaveLength(1);
  });

  it('forwards video packets, size changes, logs and clipboard', async () => {
    const { session, client, logger } = setup();
    const packets: VideoPacket[] = [];
    const clipboard: string[] = [];
    const sizes: unknown[] = [];
    session.onVideoPacket((packet) => packets.push(packet));
    session.onDeviceClipboard((text) => clipboard.push(text));
    await session.start();
    session.onDidChangeVideoConfig((config) => sizes.push(config));
    client.video.push({ type: 'data', data: new Uint8Array([1]), keyframe: true, pts: 10n });
    client.output.push('[server] INFO: Device: Pixel');
    client.clipboard.push('copied on phone');
    client.resize(2400, 1080);
    await flushPromises();
    expect(packets).toEqual([{ kind: 'data', data: new Uint8Array([1]), keyframe: true, pts: 10 }]);
    expect(logger.infos).toContain('[scrcpy] [server] INFO: Device: Pixel');
    expect(clipboard).toEqual(['copied on phone']);
    expect(sizes).toEqual([{ codec: 0x68323634, width: 2400, height: 1080 }]);
  });

  it('works without a clipboard stream', async () => {
    const { session, client } = setup();
    client.hasClipboard = false;
    await expect(session.start()).resolves.toBeUndefined();
  });

  it('routes control only while streaming', async () => {
    const { session, client } = setup();
    await session.control.text('before');
    await session.start();
    await session.control.touch({ action: 'down', pointer: 'primary', x: 0.5, y: 0.5 });
    expect(client.writer.methods()).toEqual(['injectTouch']);
  });

  it('requests keyframes from the server', async () => {
    const { session, client } = setup();
    await session.requestKeyframe();
    await session.start();
    await session.requestKeyframe();
    expect(client.writer.methods()).toEqual(['resetVideo']);
  });

  it('logs when the video stream breaks mid-session', async () => {
    const { session, client, logger } = setup();
    await session.start();
    client.video.fail(new Error('usb reset'));
    await flushPromises();
    expect(logger.errors.map((entry) => entry.message)).toContain('Video stream interrupted');
  });

  it('swallows broken output and clipboard streams', async () => {
    const { session, client, logger } = setup();
    await session.start();
    client.output.fail(new Error('closed'));
    client.clipboard.fail(new Error('closed'));
    await flushPromises();
    expect(logger.errors).toEqual([]);
  });

  it.each([
    ['exits', (client: FakeScrcpyLauncher['client']) => client.exit()],
    ['crashes', (client: FakeScrcpyLauncher['client']) => client.crash(new Error('killed'))],
  ])('moves to disconnected and releases resources when the server %s', async (_label, stop) => {
    const { session, client, pool, states, logger } = setup();
    await session.start();
    stop(client);
    await flushPromises();
    expect(states.at(-1)).toBe('disconnected');
    expect(client.closed).toBe(1);
    expect(pool.released).toBe(1);
    expect(logger.infos).toContain('scrcpy server on R5CX123 stopped');
  });

  it('wraps launch failures with the server output', async () => {
    const { session, launcher, states, pool, logger } = setup();
    launcher.failure = new AdbScrcpyExitedError(['Aborted']);
    const error = await session.start().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MirrorStartError);
    expect((error as MirrorStartError).details).toEqual(['Aborted']);
    expect(states).toEqual(['connecting', 'error']);
    expect(pool.released).toBe(1);
    expect(logger.errors[0]?.message).toBe('Failed to start mirroring on R5CX123');
  });

  it('wraps unknown failures without details', async () => {
    const { session, client } = setup();
    client.videoFailure = new Error('no video');
    const error = await session.start().catch((reason: unknown) => reason);
    expect((error as MirrorStartError).details).toEqual([]);
    expect(client.closed).toBe(1);
  });

  it('keeps domain errors untouched', async () => {
    const { session, pool } = setup();
    pool.failure = new NoDeviceError();
    await expect(session.start()).rejects.toBe(pool.failure);
  });

  it('logs failures while closing the scrcpy client and still releases the device', async () => {
    const { session, client, pool, logger } = setup();
    await session.start();
    client.closeFailure = new Error('close client');
    session.dispose();
    await flushPromises();
    expect(logger.errors.map((entry) => entry.message)).toEqual(['Failed to close scrcpy client']);
    expect(pool.released).toBe(1);
  });

  it('disposes only once and stops emitting', async () => {
    const { session, client, states } = setup();
    const packets = vi.fn();
    const clipboard = vi.fn();
    session.onVideoPacket(packets);
    session.onDeviceClipboard(clipboard);
    await session.start();
    session.dispose();
    session.dispose();
    client.video.push({ type: 'data', data: new Uint8Array([1]) });
    client.clipboard.push('late');
    client.exit();
    await flushPromises();
    expect(packets).not.toHaveBeenCalled();
    expect(clipboard).not.toHaveBeenCalled();
    expect(states).toEqual(['connecting', 'streaming', 'closed']);
    expect(client.closed).toBe(1);
  });

  it('does not log stream errors after dispose', async () => {
    const { session, client, logger } = setup();
    await session.start();
    session.dispose();
    client.video.fail(new Error('closed by dispose'));
    await flushPromises();
    expect(logger.errors).toEqual([]);
  });
});
