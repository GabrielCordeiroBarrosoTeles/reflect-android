import type { AndroidKeyCode } from '@yume-chan/scrcpy';
import { Emitter } from '../../src/core/Emitter';
import type { IDeviceControl, IMirrorSession, SessionStateChange } from '../../src/scrcpy/types';
import type { KeyInput, ScrollInput, SessionStateKind, TouchInput, VideoConfig, VideoPacket } from '../../src/shared/protocol';

export class FakeDeviceControl implements IDeviceControl {
  readonly calls: { method: string; arg?: unknown }[] = [];

  private record(method: string, arg?: unknown): Promise<void> {
    this.calls.push(arg === undefined ? { method } : { method, arg });
    return Promise.resolve();
  }

  touch = (input: TouchInput) => this.record('touch', input);
  scroll = (input: ScrollInput) => this.record('scroll', input);
  key = (input: KeyInput) => this.record('key', input);
  press = (keyCode: AndroidKeyCode) => this.record('press', keyCode);
  text = (text: string) => this.record('text', text);
  back = () => this.record('back');
  home = () => this.record('home');
  paste = (text: string) => this.record('paste', text);
}

export class FakeMirrorSession implements IMirrorSession {
  readonly stateEmitter = new Emitter<SessionStateChange>();
  readonly configEmitter = new Emitter<VideoConfig>();
  readonly packetEmitter = new Emitter<VideoPacket>();
  readonly clipboardEmitter = new Emitter<string>();
  readonly onDidChangeState = this.stateEmitter.event;
  readonly onDidChangeVideoConfig = this.configEmitter.event;
  readonly onVideoPacket = this.packetEmitter.event;
  readonly onDeviceClipboard = this.clipboardEmitter.event;
  readonly control = new FakeDeviceControl();
  state: SessionStateKind = 'idle';
  videoConfig: VideoConfig | undefined;
  startFailure: unknown;
  keyframeFailure: Error | undefined;
  started = 0;
  keyframes = 0;
  disposed = 0;

  start(): Promise<void> {
    this.started += 1;
    return this.startFailure === undefined ? Promise.resolve() : Promise.reject(this.startFailure);
  }

  requestKeyframe(): Promise<void> {
    this.keyframes += 1;
    return this.keyframeFailure ? Promise.reject(this.keyframeFailure) : Promise.resolve();
  }

  dispose(): void {
    this.disposed += 1;
  }
}
