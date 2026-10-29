import { afterEach, describe, expect, it, vi } from 'vitest';
import { HIDDEN_SHUTDOWN_MS, MirrorController } from '../../src/mirror/MirrorController';
import type { MirrorCloseReason } from '../../src/mirror/types';
import type { VideoPacket, WebviewToHostMessage } from '../../src/shared/protocol';
import { device } from '../fakes/devices';
import { FakeClipboard } from '../fakes/FakeClipboard';
import { FakeLogger } from '../fakes/FakeLogger';
import { FakeMirrorSession } from '../fakes/FakeMirrorSession';
import { FakeSurface } from '../fakes/FakeSurface';
import { Emitter } from '../../src/core/Emitter';
import type { InspectHighlight } from '../../src/shared/protocol';
import type { IRecorder } from '../../src/recording/types';
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
  const inspector = {
    inspectAt: vi.fn(),
    hoverAt: vi.fn((_device: unknown, _point: unknown, onHighlight: (highlight: InspectHighlight | undefined) => void) => onHighlight(undefined)),
    cancel: vi.fn(),
  };
  const actions = { reloadApp: vi.fn(() => Promise.resolve(true)), reverseMetro: vi.fn(() => Promise.resolve(8081)), notify: vi.fn() };
  const captures = { save: vi.fn(() => Promise.resolve('/captures/shot.png')), reserve: vi.fn(() => Promise.resolve('/captures/clip.mp4')) };
  const recorders: (IRecorder & { pushed: VideoPacket[]; stopped: number; onFormatChange: () => void; result: Promise<boolean> })[] = [];
  const createRecorder = vi.fn((path: string, onFormatChange: () => void) => {
    const recorder = {
      path,
      pushed: [] as VideoPacket[],
      stopped: 0,
      onFormatChange,
      push(packet: VideoPacket) {
        this.pushed.push(packet);
      },
      result: Promise.resolve(true) as Promise<boolean>,
      stop() {
        this.stopped += 1;
        return this.result;
      },
    };
    recorders.push(recorder);
    return recorder;
  });
  const onCaptured = vi.fn();
  const availabilityChanges = new Emitter<void>();
  const availability = { onDidChange: availabilityChanges.event, isReady: vi.fn(() => false) };
  const surface = new FakeSurface();
  const controller = new MirrorController(device({ name: 'Pixel 8', model: 'Pixel 8' }), surface, session, {
    logger,
    clipboard,
    onError,
    inspector,
    actions,
    captures,
    createRecorder,
    onCaptured,
    availability,
    reconnectTiming: { baseDelayMs: 100, maxDelayMs: 400, giveUpAfterMs: 1000 },
  });
  const reasons: MirrorCloseReason[] = [];
  controller.onDidDispose((reason) => reasons.push(reason));
  const send = async (message: WebviewToHostMessage) => {
    surface.channel.messages.fire(message);
    await flushPromises();
  };
  return { session, logger, clipboard, onError, inspector, actions, captures, recorders, createRecorder, onCaptured, availability, availabilityChanges, surface, controller, send, reasons, posted: surface.channel.posted };
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
      { type: 'toolbar-state', state: { recordingSince: undefined, screenOff: false } },
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
    expect(session.control.calls.map((call) => call.method)).toEqual(['touch', 'scroll', 'key', 'text', 'paste', 'pressButton', 'pressButton']);
    expect(session.control.calls.slice(5)).toEqual([
      { method: 'pressButton', arg: 'back' },
      { method: 'pressButton', arg: 'home' },
    ]);
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
      { type: 'toolbar-state', state: { recordingSince: undefined, screenOff: false } },
    ]);
  });

  it('routes inspect clicks and cancellation to the inspector', async () => {
    const { inspector, send } = setup();
    await send({ type: 'inspect-at', x: 0.4, y: 0.6 });
    await send({ type: 'inspect-cancel' });
    expect(inspector.inspectAt).toHaveBeenCalledWith(expect.objectContaining({ model: 'Pixel 8' }), { x: 0.4, y: 0.6 });
    expect(inspector.cancel).toHaveBeenCalledOnce();
  });

  it('forwards hover highlights back to the webview', async () => {
    const { inspector, send, posted } = setup();
    await send({ type: 'inspect-hover', x: 0.2, y: 0.3 });
    expect(inspector.hoverAt).toHaveBeenCalledWith(expect.objectContaining({ model: 'Pixel 8' }), { x: 0.2, y: 0.3 }, expect.any(Function));
    expect(posted.at(-1)).toEqual({ type: 'inspect-highlight', highlight: undefined });
  });

  it('runs toolbar actions on the device', async () => {
    const { session, send } = setup();
    await send({ type: 'action', id: 'home' });
    expect(session.control.calls).toEqual([{ method: 'pressButton', arg: 'home' }]);
  });

  it('saves screenshots taken by the webview', async () => {
    const { controller, posted, send, captures, onCaptured } = setup();
    const capture = controller.takeScreenshot();
    await flushPromises();
    expect(posted.at(-1)).toEqual({ type: 'capture-screenshot', requestId: 1 });
    await send({ type: 'screenshot', requestId: 1, data: new Uint8Array([7]) });
    await capture;
    expect(captures.save).toHaveBeenCalledWith(new Uint8Array([7]), 'png', 'Pixel 8');
    expect(onCaptured).toHaveBeenCalledWith('screenshot', '/captures/shot.png');
  });

  it('explains when there is no frame to capture', async () => {
    const { controller, send, actions, captures } = setup();
    const capture = controller.takeScreenshot();
    await flushPromises();
    await send({ type: 'screenshot', requestId: 1, data: undefined });
    await capture;
    expect(actions.notify).toHaveBeenCalledWith('No frame to capture yet');
    expect(captures.save).not.toHaveBeenCalled();
  });

  it('records the stream, primed with the cached configuration, and saves it on stop', async () => {
    const { controller, session, posted, recorders, onCaptured, captures } = setup();
    session.packetEmitter.fire(configurationPacket);
    await controller.toggleRecording();
    session.packetEmitter.fire(dataPacket);
    expect(captures.reserve).toHaveBeenCalledWith('mp4', 'Pixel 8');
    expect(session.keyframes).toBe(1);
    expect(recorders[0]?.pushed).toEqual([configurationPacket, dataPacket]);
    expect(posted.filter((message) => message.type === 'toolbar-state').at(-1)).toEqual({
      type: 'toolbar-state',
      state: { recordingSince: expect.any(Number), screenOff: false },
    });
    await controller.toggleRecording();
    expect(recorders[0]?.stopped).toBe(1);
    expect(onCaptured).toHaveBeenCalledWith('recording', '/captures/clip.mp4');
    expect(posted.at(-1)).toEqual({ type: 'toolbar-state', state: { recordingSince: undefined, screenOff: false } });
  });

  it('tells the user when nothing was recorded or saving failed', async () => {
    const empty = setup();
    await empty.controller.toggleRecording();
    empty.recorders[0]!.result = Promise.resolve(false);
    await empty.controller.toggleRecording();
    expect(empty.actions.notify).toHaveBeenCalledWith('Nothing was recorded');
    expect(empty.onCaptured).not.toHaveBeenCalled();
    const failing = setup();
    await failing.controller.toggleRecording();
    const failure = new Error('disk full');
    failing.recorders[0]!.result = Promise.reject(failure);
    await failing.controller.toggleRecording();
    expect(failing.actions.notify).toHaveBeenCalledWith('Recording could not be saved');
    expect(failing.logger.errors).toEqual([{ message: 'Recording could not be saved', error: failure }]);
  });

  it('reports failing actions and recovers the recording queue', async () => {
    const { controller, captures, onError, recorders } = setup();
    const failure = new Error('read-only folder');
    captures.reserve.mockImplementationOnce(() => Promise.reject(failure));
    await controller.runAction('record');
    expect(onError).toHaveBeenCalledWith(failure);
    await controller.runAction('record');
    expect(recorders).toHaveLength(1);
  });

  it('records without a cached configuration', async () => {
    const { controller, recorders } = setup();
    await controller.toggleRecording();
    expect(recorders[0]?.pushed).toEqual([]);
  });

  it('stops recording when the format changes, the device disconnects or the mirror closes', async () => {
    const formatChange = setup();
    await formatChange.controller.toggleRecording();
    formatChange.recorders[0]?.onFormatChange();
    await flushPromises();
    expect(formatChange.recorders[0]?.stopped).toBe(1);
    const disconnect = setup();
    await disconnect.controller.toggleRecording();
    disconnect.session.stateEmitter.fire({ state: 'disconnected' });
    disconnect.controller.dispose();
    await flushPromises();
    expect(disconnect.recorders[0]?.stopped).toBe(1);
    const closing = setup();
    await closing.controller.toggleRecording();
    closing.controller.dispose();
    await flushPromises();
    expect(closing.recorders[0]?.stopped).toBe(1);
  });

  it('toggles the physical screen and reports it to the toolbar', async () => {
    const { controller, session, posted } = setup();
    await controller.toggleScreenPower();
    await controller.toggleScreenPower();
    expect(session.control.calls).toEqual([
      { method: 'setScreenPower', arg: false },
      { method: 'setScreenPower', arg: true },
    ]);
    expect(posted.filter((message) => message.type === 'toolbar-state')).toEqual([
      { type: 'toolbar-state', state: { recordingSince: undefined, screenOff: true } },
      { type: 'toolbar-state', state: { recordingSince: undefined, screenOff: false } },
    ]);
  });

  it('shows a reconnecting state and restarts the session when the device comes back', async () => {
    vi.useFakeTimers();
    const { session, posted, availability, availabilityChanges } = setup();
    session.stateEmitter.fire({ state: 'disconnected' });
    expect(posted.at(-1)).toEqual({ type: 'session-state', state: 'disconnected', deviceName: 'Pixel 8', detail: 'Reconnecting… plug the cable back in' });
    session.stateEmitter.fire({ state: 'connecting' });
    session.stateEmitter.fire({ state: 'error', detail: 'device gone' });
    expect(posted.filter((message) => message.type === 'session-state')).toHaveLength(1);
    availability.isReady.mockReturnValue(true);
    availabilityChanges.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(session.started).toBe(1);
    session.stateEmitter.fire({ state: 'streaming' });
    expect(posted.at(-1)).toEqual({ type: 'session-state', state: 'streaming', deviceName: 'Pixel 8' });
  });

  it('offers a manual reconnect after giving up', async () => {
    vi.useFakeTimers();
    const { session, posted, send, availability } = setup();
    session.stateEmitter.fire({ state: 'disconnected' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(posted.at(-1)).toEqual({
      type: 'session-state',
      state: 'disconnected',
      deviceName: 'Pixel 8',
      detail: 'Device not found. Check the cable and USB debugging.',
      canReconnect: true,
    });
    availability.isReady.mockReturnValue(true);
    vi.useRealTimers();
    await send({ type: 'reconnect' });
    expect(posted.filter((message) => message.type === 'session-state').at(-1)).toEqual({
      type: 'session-state',
      state: 'disconnected',
      deviceName: 'Pixel 8',
      detail: 'Reconnecting… plug the cable back in',
    });
    await vi.waitFor(() => expect(session.started).toBe(1));
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
