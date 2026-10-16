import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_SHUTDOWN_MS, MirrorController } from '../../src/mirror/MirrorController';
import type { MirrorCloseReason } from '../../src/mirror/types';
import type { VideoPacket, WebviewToHostMessage } from '../../src/shared/protocol';
import { deviceInfo } from '../fakes/devices';
import { FakeClipboard } from '../fakes/FakeClipboard';
import { FakeLogger } from '../fakes/FakeLogger';
import { FakeMirrorSession } from '../fakes/FakeMirrorSession';
import { FakeSurface } from '../fakes/FakeSurface';
import { flushPromises } from '../fakes/PushStream';

const config = { codec: 1, width: 1080, height: 2400 };
const configurationPacket: VideoPacket = { kind: 'configuration', data: new Uint8Array([1]), keyframe: undefined, pts: undefined };
const dataPacket: VideoPacket = { kind: 'data', data: new Uint8Array([2]), keyframe: true, pts: 1 };

afterEach(() => {
  vi.useRealTimers();
});

const setup = () => {
  const session = new FakeMirrorSession();
  const logger = new FakeLogger();
  const clipboard = new FakeClipboard('from mac');
  const onError = vi.fn();
  const inspector = { inspectAt: vi.fn(), cancel: vi.fn() };
  const surface = new FakeSurface();
  const controller = new MirrorController(deviceInfo({ model: 'Pixel 8' }), surface, session, { logger, clipboard, onError, inspector });
  const reasons: MirrorCloseReason[] = [];
  controller.onDidDispose((reason) => reasons.push(reason));
  const send = async (message: WebviewToHostMessage) => {
    surface.channel.messages.fire(message);
    await flushPromises();
  };
  return { session, logger, clipboard, onError, inspector, surface, controller, send, reasons, posted: surface.channel.posted };
};

describe('MirrorController', () => {
  it('reveals the surface, starts the session and reports start failures', async () => {
    const { controller, session, onError, surface } = setup();
    session.startFailure = new Error('nope');
    controller.start();
    await flushPromises();
    expect(surface.revealed).toBe(1);
    expect(session.started).toBe(1);
    expect(onError).toHaveBeenCalledWith(session.startFailure);
  });

  it('forwards session state with and without detail', () => {
    const { session, posted } = setup();
    session.stateEmitter.fire({ state: 'connecting' });
    session.stateEmitter.fire({ state: 'error', detail: 'boom' });
    expect(posted).toEqual([
      { type: 'session-state', state: 'connecting', deviceName: 'Pixel 8' },
      { type: 'session-state', state: 'error', deviceName: 'Pixel 8', detail: 'boom' },
    ]);
  });

  it('forwards video config and packets only while visible', () => {
    const { session, posted, surface } = setup();
    session.configEmitter.fire(config);
    session.packetEmitter.fire(dataPacket);
    surface.visible = false;
    session.packetEmitter.fire(dataPacket);
    expect(posted).toEqual([
      { type: 'video-config', config },
      { type: 'video-packet', packet: dataPacket },
    ]);
  });

  it('resyncs a ready webview with state, config, cached configuration and a keyframe', async () => {
    const { session, posted, send } = setup();
    session.state = 'streaming';
    session.videoConfig = config;
    session.packetEmitter.fire(configurationPacket);
    posted.length = 0;
    await send({ type: 'ready' });
    expect(posted).toEqual([
      { type: 'session-state', state: 'streaming', deviceName: 'Pixel 8' },
      { type: 'inspect-mode', active: false },
      { type: 'video-config', config },
      { type: 'video-packet', packet: configurationPacket },
    ]);
    expect(session.keyframes).toBe(1);
  });

  it('throttles keyframe requests and skips the cached packet when absent', async () => {
    const { session, posted, send } = setup();
    session.videoConfig = config;
    await send({ type: 'resync' });
    await send({ type: 'resync' });
    expect(posted.filter((message) => message.type === 'video-packet')).toEqual([]);
    expect(session.keyframes).toBe(1);
  });

  it('ignores resync before the video is configured', async () => {
    const { session, posted, send } = setup();
    await send({ type: 'resync' });
    expect(posted).toEqual([]);
    expect(session.keyframes).toBe(0);
  });

  it('logs keyframe request failures', async () => {
    const { session, logger, send } = setup();
    session.videoConfig = config;
    session.keyframeFailure = new Error('writer closed');
    await send({ type: 'resync' });
    expect(logger.errors[0]).toEqual({ message: 'Keyframe request failed', error: session.keyframeFailure });
  });

  it('routes webview logs by level', async () => {
    const { logger, send } = setup();
    await send({ type: 'log', level: 'info', message: 'hello' });
    await send({ type: 'log', level: 'error', message: 'bad' });
    expect(logger.infos).toEqual(['[webview] hello']);
    expect(logger.errors).toEqual([{ message: '[webview] bad', error: undefined }]);
  });

  it('routes input to the device control', async () => {
    const { session, send } = setup();
    const modifiers = { shift: false, alt: false, ctrl: false, meta: false };
    await send({ type: 'touch', input: { action: 'down', pointer: 'primary', x: 0.1, y: 0.2 } });
    await send({ type: 'scroll', input: { x: 0, y: 0, scrollX: 0, scrollY: 1 } });
    await send({ type: 'key', input: { action: 'down', code: 'KeyA', repeat: 0, modifiers } });
    await send({ type: 'text', text: 'abc' });
    await send({ type: 'paste' });
    await send({ type: 'mouse-shortcut', shortcut: 'back' });
    await send({ type: 'mouse-shortcut', shortcut: 'home' });
    expect(session.control.calls.map((call) => call.method)).toEqual(['touch', 'scroll', 'key', 'text', 'paste', 'back', 'home']);
    expect(session.control.calls[4]).toEqual({ method: 'paste', arg: 'from mac' });
  });

  it('leaves open-device requests to the sidebar host', async () => {
    const { session, logger, send } = setup();
    await send({ type: 'open-device' });
    expect(session.control.calls).toEqual([]);
    expect(logger.errors).toEqual([]);
  });

  it('forwards inspect mode to the webview and replays it when the webview reloads', async () => {
    const { controller, posted, send } = setup();
    controller.setInspectMode(true);
    await send({ type: 'ready' });
    expect(posted).toEqual([
      { type: 'inspect-mode', active: true },
      { type: 'session-state', state: 'idle', deviceName: 'Pixel 8' },
      { type: 'inspect-mode', active: true },
    ]);
  });

  it('routes inspect clicks and cancellation to the inspector', async () => {
    const { inspector, send } = setup();
    await send({ type: 'inspect-at', x: 0.4, y: 0.6 });
    await send({ type: 'inspect-cancel' });
    expect(inspector.inspectAt).toHaveBeenCalledWith(expect.objectContaining({ model: 'Pixel 8' }), { x: 0.4, y: 0.6 });
    expect(inspector.cancel).toHaveBeenCalledOnce();
  });

  it('logs handler failures without crashing', async () => {
    const { session, logger, send } = setup();
    const failure = new Error('control failed');
    session.control.text = () => Promise.reject(failure);
    await send({ type: 'text', text: 'x' });
    expect(logger.errors).toEqual([{ message: 'Failed to handle "text"', error: failure }]);
  });

  it('copies the device clipboard to the host', async () => {
    const { session, clipboard } = setup();
    session.clipboardEmitter.fire('copied on phone');
    await flushPromises();
    expect(clipboard.text).toBe('copied on phone');
  });

  it('reveals the surface on demand', () => {
    const { controller, surface } = setup();
    controller.reveal();
    expect(surface.revealed).toBe(1);
  });

  it('shuts the session down after staying hidden and reports why', () => {
    vi.useFakeTimers();
    const { surface, session, reasons } = setup();
    surface.visibility.fire(false);
    vi.advanceTimersByTime(HIDDEN_SHUTDOWN_MS - 1);
    expect(session.disposed).toBe(0);
    vi.advanceTimersByTime(1);
    expect(session.disposed).toBe(1);
    expect(surface.disposed).toBe(1);
    expect(reasons).toEqual(['hidden']);
  });

  it('keeps running when the surface shows again in time', () => {
    vi.useFakeTimers();
    const { surface, session } = setup();
    surface.visibility.fire(false);
    vi.advanceTimersByTime(HIDDEN_SHUTDOWN_MS / 2);
    surface.visibility.fire(true);
    vi.advanceTimersByTime(HIDDEN_SHUTDOWN_MS);
    expect(session.disposed).toBe(0);
  });

  it('closes once when the surface goes away', () => {
    const { controller, session, surface, reasons } = setup();
    surface.closing.fire();
    controller.dispose();
    expect(session.disposed).toBe(1);
    expect(reasons).toEqual(['closed']);
  });

  it('releases the surface when disposed directly', () => {
    const { controller, surface, reasons } = setup();
    controller.dispose();
    expect(surface.disposed).toBe(1);
    expect(reasons).toEqual(['closed']);
  });
});
