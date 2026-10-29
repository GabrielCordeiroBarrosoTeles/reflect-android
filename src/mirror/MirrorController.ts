import { deviceLabel } from '../devices/types';
import type { Device } from '../devices/types';
import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import { DEVICE_ACTIONS } from '../actions/deviceActions';
import type { MirrorCapabilities } from '../actions/types';
import type { IRecorder } from '../recording/types';
import type { IMirrorSession, SessionStateChange } from '../scrcpy/types';
import type { ActionId } from '../shared/actions';
import type { LogLevel, VideoPacket, WebviewToHostMessage } from '../shared/protocol';
import { AutoReconnect } from './AutoReconnect';
import { HiddenTimeout } from './HiddenTimeout';
import { KeyframeThrottle } from './KeyframeThrottle';
import { ScreenshotRequester } from './ScreenshotRequester';
import type { IMirrorController, IMirrorSurface, MirrorCloseReason, MirrorServices } from './types';

export const HIDDEN_SHUTDOWN_MS = 30_000;
export const SCREENSHOT_TIMEOUT_MS = 5_000;
const RECONNECTING_DETAIL = 'Reconnecting… plug the cable back in';
const GAVE_UP_DETAIL = 'Device not found. Check the cable and USB debugging.';

type MessageHandlers = {
  [K in WebviewToHostMessage['type']]: (message: Extract<WebviewToHostMessage, { type: K }>) => Promise<void> | void;
};

export class MirrorController implements IMirrorController, MirrorCapabilities {
  private readonly store = new DisposableStore();
  private readonly disposeEmitter = new Emitter<MirrorCloseReason>();
  private readonly hiddenTimeout = new HiddenTimeout(HIDDEN_SHUTDOWN_MS, () => this.close('hidden'));
  private readonly keyframeThrottle = new KeyframeThrottle(500);
  private configurationPacket: VideoPacket | undefined;
  private inspecting = false;
  private readonly screenshots: ScreenshotRequester;
  private recorder: IRecorder | undefined;
  private recordingSince: number | undefined;
  private screenOff = false;
  private recordingQueue: Promise<void> = Promise.resolve();
  private readonly reconnect: AutoReconnect;
  private gaveUp = false;
  private disposed = false;

  readonly onDidDispose = this.disposeEmitter.event;

  private readonly handlers: MessageHandlers = {
    ready: () => {
      this.postState({ state: this.session.state });
      this.surface.channel.post({ type: 'inspect-mode', active: this.inspecting });
      this.postToolbarState();
      this.resyncVideo();
    },
    resync: () => this.resyncVideo(),
    log: ({ level, message }) => this.logWebviewMessage(level, message),
    touch: ({ input }) => this.session.control.touch(input),
    scroll: ({ input }) => this.session.control.scroll(input),
    key: ({ input }) => this.session.control.key(input),
    text: ({ text }) => this.session.control.text(text),
    paste: async () => this.session.control.paste(await this.services.clipboard.readText()),
    'mouse-shortcut': ({ shortcut }) => this.session.control.pressButton(shortcut),
    'open-device': () => undefined,
    reconnect: () => this.reconnectNow(),
    'inspect-at': ({ x, y }) => this.services.inspector.inspectAt(this.device, { x, y }),
    'inspect-hover': ({ x, y }) =>
      this.services.inspector.hoverAt(this.device, { x, y }, (highlight) => this.surface.channel.post({ type: 'inspect-highlight', highlight })),
    'inspect-cancel': () => this.services.inspector.cancel(),
    action: ({ id }) => this.runAction(id),
    screenshot: ({ requestId, data }) => this.screenshots.resolve(requestId, data),
  };

  constructor(
    readonly device: Device,
    private readonly surface: IMirrorSurface,
    private readonly session: IMirrorSession,
    private readonly services: MirrorServices,
  ) {
    this.screenshots = new ScreenshotRequester(surface.channel, SCREENSHOT_TIMEOUT_MS);
    this.reconnect = new AutoReconnect({
      serial: device.id,
      availability: services.availability,
      timing: services.reconnectTiming,
      reconnect: () => session.start(),
      onGiveUp: () => {
        this.gaveUp = true;
        this.postState({ state: 'disconnected', detail: GAVE_UP_DETAIL });
      },
    });
    this.store.add(this.reconnect);
    this.store.add(session);
    this.store.add(this.hiddenTimeout);
    this.store.add(this.screenshots);
    this.store.add(surface.channel.onMessage((message) => this.dispatch(message)));
    this.store.add(surface.onDidChangeVisibility((visible) => this.hiddenTimeout.update(visible)));
    this.store.add(session.onDidChangeState((change) => this.handleSessionState(change)));
    this.store.add(session.onDidChangeVideoConfig((config) => surface.channel.post({ type: 'video-config', config })));
    this.store.add(session.onVideoPacket((packet) => this.forwardPacket(packet)));
    this.store.add(session.onDeviceClipboard((text) => void this.services.clipboard.writeText(text)));
    this.store.add(surface.onDidDispose(() => this.close('closed')));
  }

  reveal(): void {
    this.surface.reveal();
  }

  start(): void {
    this.surface.reveal();
    void this.session.start().catch((error: unknown) => this.services.onError(error));
  }

  private reconnectNow(): void {
    this.gaveUp = false;
    this.reconnect.start();
    this.postState({ state: 'disconnected', detail: RECONNECTING_DETAIL });
  }

  runAction(id: ActionId): Promise<void> {
    return DEVICE_ACTIONS[id]({ device: this.device, control: this.session.control, mirror: this, services: this.services.actions }).catch(
      (error: unknown) => this.services.onError(error),
    );
  }

  async takeScreenshot(): Promise<void> {
    const data = await this.screenshots.request();
    if (!data) {
      this.services.actions.notify('No frame to capture yet');
      return;
    }
    this.services.onCaptured('screenshot', await this.services.captures.save(data, 'png', deviceLabel(this.device)));
  }

  toggleRecording(): Promise<void> {
    return this.enqueueRecording(() => (this.recorder ? this.finishRecording() : this.beginRecording()));
  }

  private stopRecording(): Promise<void> {
    return this.enqueueRecording(() => this.finishRecording());
  }

  private enqueueRecording(task: () => Promise<void>): Promise<void> {
    const run = this.recordingQueue.then(task);
    this.recordingQueue = run.catch(() => undefined);
    return run;
  }

  private async beginRecording(): Promise<void> {
    const path = await this.services.captures.reserve('mp4', deviceLabel(this.device));
    this.recorder = this.services.createRecorder(path, () => void this.stopRecording());
    this.recordingSince = Date.now();
    if (this.configurationPacket) {
      this.recorder.push(this.configurationPacket);
    }
    this.postToolbarState();
    await this.session.requestKeyframe();
  }

  async toggleScreenPower(): Promise<void> {
    this.screenOff = !this.screenOff;
    this.postToolbarState();
    await this.session.control.setScreenPower(!this.screenOff);
  }

  setInspectMode(active: boolean): void {
    this.inspecting = active;
    this.surface.channel.post({ type: 'inspect-mode', active });
  }

  dispose(): void {
    this.close('closed');
  }

  private close(reason: MirrorCloseReason): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    void this.stopRecording();
    this.store.dispose();
    this.surface.dispose();
    this.disposeEmitter.fire(reason);
    this.disposeEmitter.dispose();
  }

  private dispatch(message: WebviewToHostMessage): void {
    const handler = this.handlers[message.type] as (value: WebviewToHostMessage) => Promise<void> | void;
    Promise.resolve()
      .then(() => handler(message))
      .catch((error: unknown) => this.services.logger.error(`Failed to handle "${message.type}"`, error));
  }

  private async finishRecording(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) {
      return;
    }
    this.recorder = undefined;
    this.recordingSince = undefined;
    this.postToolbarState();
    try {
      if (await recorder.stop()) {
        this.services.onCaptured('recording', recorder.path);
        return;
      }
      this.services.actions.notify('Nothing was recorded');
    } catch (error) {
      this.services.logger.error('Recording could not be saved', error);
      this.services.actions.notify('Recording could not be saved');
    }
  }

  private postToolbarState(): void {
    this.surface.channel.post({ type: 'toolbar-state', state: { recordingSince: this.recordingSince, screenOff: this.screenOff } });
  }

  private forwardPacket(packet: VideoPacket): void {
    if (packet.kind === 'configuration') {
      this.configurationPacket = packet;
    }
    this.recorder?.push(packet);
    if (this.surface.visible) {
      this.surface.channel.post({ type: 'video-packet', packet });
    }
  }

  private resyncVideo(): void {
    const config = this.session.videoConfig;
    if (!config) {
      return;
    }
    this.surface.channel.post({ type: 'video-config', config });
    if (this.configurationPacket) {
      this.surface.channel.post({ type: 'video-packet', packet: this.configurationPacket });
    }
    if (this.keyframeThrottle.tryAcquire()) {
      void this.session
        .requestKeyframe()
        .catch((error: unknown) => this.services.logger.error('Keyframe request failed', error));
    }
  }

  private logWebviewMessage(level: LogLevel, message: string): void {
    const line = `[webview] ${message}`;
    if (level === 'error') {
      this.services.logger.error(line);
      return;
    }
    this.services.logger.info(line);
  }

  private handleSessionState(change: SessionStateChange): void {
    if (change.state === 'disconnected') {
      void this.stopRecording();
      this.reconnectNow();
      return;
    }
    if (change.state === 'streaming') {
      this.reconnect.stop();
      this.gaveUp = false;
    }
    if (this.reconnect.active && change.state !== 'streaming') {
      return;
    }
    this.postState(change);
  }

  private postState(change: SessionStateChange): void {
    this.surface.channel.post({
      type: 'session-state',
      state: change.state,
      deviceName: deviceLabel(this.device),
      ...(change.detail === undefined ? {} : { detail: change.detail }),
      ...(this.gaveUp ? { canReconnect: true } : {}),
    });
  }
}
