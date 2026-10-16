import { deviceLabel } from '../adb/toDeviceInfo';
import type { DeviceInfo } from '../adb/types';
import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import type { IMirrorSession, SessionStateChange } from '../scrcpy/types';
import type { LogLevel, VideoPacket, WebviewToHostMessage } from '../shared/protocol';
import { HiddenTimeout } from './HiddenTimeout';
import { KeyframeThrottle } from './KeyframeThrottle';
import type { IMirrorController, IMirrorSurface, MirrorCloseReason, MirrorServices } from './types';

export const HIDDEN_SHUTDOWN_MS = 30_000;

type MessageHandlers = {
  [K in WebviewToHostMessage['type']]: (message: Extract<WebviewToHostMessage, { type: K }>) => Promise<void> | void;
};

export class MirrorController implements IMirrorController {
  private readonly store = new DisposableStore();
  private readonly disposeEmitter = new Emitter<MirrorCloseReason>();
  private readonly hiddenTimeout = new HiddenTimeout(HIDDEN_SHUTDOWN_MS, () => this.close('hidden'));
  private readonly keyframeThrottle = new KeyframeThrottle(500);
  private configurationPacket: VideoPacket | undefined;
  private inspecting = false;
  private disposed = false;

  readonly onDidDispose = this.disposeEmitter.event;

  private readonly handlers: MessageHandlers = {
    ready: () => {
      this.postState({ state: this.session.state });
      this.surface.channel.post({ type: 'inspect-mode', active: this.inspecting });
      this.resyncVideo();
    },
    resync: () => this.resyncVideo(),
    log: ({ level, message }) => this.logWebviewMessage(level, message),
    touch: ({ input }) => this.session.control.touch(input),
    scroll: ({ input }) => this.session.control.scroll(input),
    key: ({ input }) => this.session.control.key(input),
    text: ({ text }) => this.session.control.text(text),
    paste: async () => this.session.control.paste(await this.services.clipboard.readText()),
    'mouse-shortcut': ({ shortcut }) => (shortcut === 'back' ? this.session.control.back() : this.session.control.home()),
    'open-device': () => undefined,
    'inspect-at': ({ x, y }) => this.services.inspector.inspectAt(this.device, { x, y }),
    'inspect-cancel': () => this.services.inspector.cancel(),
  };

  constructor(
    readonly device: DeviceInfo,
    private readonly surface: IMirrorSurface,
    private readonly session: IMirrorSession,
    private readonly services: MirrorServices,
  ) {
    this.store.add(session);
    this.store.add(this.hiddenTimeout);
    this.store.add(surface.channel.onMessage((message) => this.dispatch(message)));
    this.store.add(surface.onDidChangeVisibility((visible) => this.hiddenTimeout.update(visible)));
    this.store.add(session.onDidChangeState((change) => this.postState(change)));
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

  private forwardPacket(packet: VideoPacket): void {
    if (packet.kind === 'configuration') {
      this.configurationPacket = packet;
    }
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

  private postState(change: SessionStateChange): void {
    this.surface.channel.post({
      type: 'session-state',
      state: change.state,
      deviceName: deviceLabel(this.device),
      ...(change.detail === undefined ? {} : { detail: change.detail }),
    });
  }
}
