import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import { Emitter } from '../core/Emitter';
import { MirrorStartError, SimulatorNotBootedError, XcodeUnsupportedError, isReflectError } from '../core/errors';
import type { IDisposable, ILogger } from '../core/types';
import type { Device } from '../devices/types';
import type { IDeviceControl, IMirrorSession } from '../platform/types';
import { SessionStateMachine } from '../platform/SessionStateMachine';
import type { SessionStateKind, VideoConfig, VideoPacket } from '../shared/protocol';
import type { HelperCommand, HelperEvent, HelperFrame, HelperHello, HelperProcessFactory, IHelperProcess, ISimctl } from './types';

const START_TIMEOUT_MS = 15_000;
const CLIPBOARD_POLL_MS = 1000;

const resolved = (): Promise<void> => Promise.resolve();

const NO_CONTROL: IDeviceControl = {
  touch: resolved,
  scroll: resolved,
  key: resolved,
  text: resolved,
  paste: resolved,
  pressButton: resolved,
  rotate: resolved,
  setScreenPower: resolved,
};

type ControlFactory = (send: (command: HelperCommand) => void, hello: HelperHello) => IDeviceControl;

interface PendingStart {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

export class HelperMirrorSession implements IMirrorSession {
  private readonly stateMachine = new SessionStateMachine();
  private readonly videoConfigEmitter = new Emitter<VideoConfig>();
  private readonly packetEmitter = new Emitter<VideoPacket>();
  private readonly clipboardEmitter = new Emitter<string>();
  private helper: IHelperProcess | undefined;
  private helperSubscriptions: IDisposable[] = [];
  private xcodeVersion: string | undefined;
  private realControl: IDeviceControl | undefined;
  private pendingStart: PendingStart | undefined;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private clipboardTimer: ReturnType<typeof setTimeout> | undefined;
  private clipboardText: string | undefined;
  private currentVideoConfig: VideoConfig | undefined;
  private disposed = false;

  readonly onDidChangeState = this.stateMachine.onDidChange;
  readonly onDidChangeVideoConfig = this.videoConfigEmitter.event;
  readonly onVideoPacket = this.packetEmitter.event;
  readonly onDeviceClipboard = this.clipboardEmitter.event;
  readonly control = new Proxy({} as IDeviceControl, {
    get: (_target, method: keyof IDeviceControl) => {
      const control = this.realControl ?? NO_CONTROL;
      return (...args: [never]) => (control[method] as (...input: [never]) => Promise<void>)(...args);
    },
  });

  constructor(
    private readonly device: Device,
    private readonly spawn: HelperProcessFactory,
    private readonly createControl: ControlFactory,
    private readonly logger: ILogger,
    private readonly simctl: ISimctl,
    private readonly onStreaming: (send: (command: HelperCommand) => void) => void,
  ) {}

  get state(): SessionStateKind {
    return this.stateMachine.state;
  }

  get videoConfig(): VideoConfig | undefined {
    return this.currentVideoConfig;
  }

  async start(): Promise<void> {
    if (!this.stateMachine.transitionTo('connecting')) {
      return;
    }
    try {
      const helper = await this.spawn(this.device.id);
      if (this.disposed) {
        helper.dispose();
        return;
      }
      this.helper = helper;
      this.helperSubscriptions = [helper.onFrame((frame) => this.handleFrame(frame)), helper.onExit(({ code }) => this.handleExit(code))];
      await this.waitForFirstFrame();
    } catch (error) {
      this.teardown();
      const failure = this.toStartError(error);
      this.stateMachine.transitionTo('error', failure.message);
      throw failure;
    }
  }

  requestKeyframe(): Promise<void> {
    this.helper?.send({ type: 'keyframe' });
    return Promise.resolve();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stateMachine.transitionTo('closed');
    this.settleStart((pending) => pending.resolve());
    this.teardown();
    this.stateMachine.dispose();
    this.videoConfigEmitter.dispose();
    this.packetEmitter.dispose();
    this.clipboardEmitter.dispose();
  }

  private waitForFirstFrame(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.pendingStart = { resolve, reject };
      this.startTimer = setTimeout(
        () => this.failStart(new MirrorStartError(this.device.id, ['The iOS helper did not produce video in time'])),
        START_TIMEOUT_MS,
      );
    });
  }

  private settleStart(settle: (pending: PendingStart) => void): void {
    const pending = this.pendingStart;
    this.pendingStart = undefined;
    clearTimeout(this.startTimer);
    this.startTimer = undefined;
    if (pending) {
      settle(pending);
    }
  }

  private failStart(error: Error): void {
    this.settleStart((pending) => pending.reject(error));
  }

  private handleFrame(frame: HelperFrame): void {
    switch (frame.kind) {
      case 'hello':
        this.xcodeVersion = frame.hello.xcodeVersion;
        this.realControl = this.createControl((command) => this.helper?.send(command), frame.hello);
        break;
      case 'video-config':
        this.handleVideoConfig(frame.width, frame.height, frame.data);
        break;
      case 'video-frame':
        this.handleVideoFrame(frame.keyframe, frame.pts, frame.data);
        break;
      case 'event':
        this.handleEvent(frame.event);
        break;
    }
  }

  private handleVideoConfig(width: number, height: number, data: Uint8Array): void {
    const current = this.currentVideoConfig;
    if (current?.width !== width || current.height !== height) {
      this.currentVideoConfig = { codec: ScrcpyVideoCodecId.H264, width, height };
      this.videoConfigEmitter.fire(this.currentVideoConfig);
    }
    this.packetEmitter.fire({ kind: 'configuration', data, keyframe: undefined, pts: undefined });
  }

  private handleVideoFrame(keyframe: boolean, pts: number, data: Uint8Array): void {
    this.packetEmitter.fire({ kind: 'data', data, keyframe, pts });
    if (this.stateMachine.transitionTo('streaming')) {
      this.settleStart((pending) => pending.resolve());
      this.pollClipboard();
      this.onStreaming((command) => this.helper?.send(command));
    }
  }

  private handleEvent(event: HelperEvent): void {
    if (event.type === 'warning') {
      this.logger.info(`[ios-helper] warning: ${event.message ?? ''}`);
      return;
    }
    if (event.type !== 'error') {
      return;
    }
    const failure = this.toHelperError(event);
    if (this.pendingStart) {
      this.failStart(failure);
      return;
    }
    this.logger.error(`[ios-helper] error ${event.code ?? ''}: ${event.message ?? ''}`, failure);
  }

  private handleExit(code: number | null): void {
    this.logger.info(`iOS helper for ${this.device.id} exited with code ${code ?? 'null'}`);
    if (this.pendingStart) {
      this.failStart(new MirrorStartError(this.device.id, [`The iOS helper exited with code ${code ?? 'null'}`]));
      return;
    }
    this.teardown();
    this.stateMachine.transitionTo('disconnected');
  }

  private pollClipboard(): void {
    this.clipboardTimer = setTimeout(() => {
      void this.readClipboard().then(() => {
        if (this.stateMachine.state === 'streaming') {
          this.pollClipboard();
        }
      });
    }, CLIPBOARD_POLL_MS);
  }

  private async readClipboard(): Promise<void> {
    try {
      const text = await this.simctl.run(['pbpaste', this.device.id]);
      const changed = this.clipboardText !== undefined && text !== this.clipboardText && text !== '';
      this.clipboardText = text;
      if (changed && this.stateMachine.state === 'streaming') {
        this.clipboardEmitter.fire(text);
      }
    } catch {
      return;
    }
  }

  private teardown(): void {
    clearTimeout(this.clipboardTimer);
    this.clipboardTimer = undefined;
    this.helperSubscriptions.forEach((subscription) => subscription.dispose());
    this.helperSubscriptions = [];
    this.helper?.dispose();
    this.helper = undefined;
    this.xcodeVersion = undefined;
    this.realControl = undefined;
  }

  private toHelperError(event: HelperEvent): Error {
    const message = event.message ?? '';
    switch (event.code) {
      case 'xcode-unsupported':
      case 'framework-unavailable':
        return new XcodeUnsupportedError(this.xcodeVersion, message ? [message] : []);
      case 'device-not-booted':
      case 'device-not-found':
        return new SimulatorNotBootedError(this.device.name);
      default:
        return new MirrorStartError(this.device.id, [message]);
    }
  }

  private toStartError(error: unknown): Error {
    if (isReflectError(error)) {
      return error;
    }
    this.logger.error(`Failed to start mirroring on ${this.device.id}`, error);
    return new MirrorStartError(this.device.id, [], error);
  }
}
