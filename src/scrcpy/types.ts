import type { MaybeConsumable, ReadableStream } from '@yume-chan/stream-extra';
import type { Event, IDisposable } from '../core/types';
import type { Adb } from '@yume-chan/adb';
import type { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy';
import type { AndroidKeyCode } from '@yume-chan/scrcpy';
import type { KeyInput, ScrollInput, SessionStateKind, TouchInput, VideoConfig, VideoPacket } from '../shared/protocol';

export interface IServerBinary {
  readonly version: string;
  open(): Promise<ReadableStream<MaybeConsumable<Uint8Array>>>;
}

export interface MirrorOptions {
  readonly maxSize: number;
  readonly videoBitRate: number;
  readonly maxFps: number;
}

export type ScrcpyClientLike = Pick<
  AdbScrcpyClient<AdbScrcpyOptionsLatest<true>>,
  'controller' | 'videoStream' | 'output' | 'clipboard' | 'exited' | 'close'
>;

export interface IScrcpyLauncher {
  launch(adb: Adb, binary: IServerBinary, options: MirrorOptions): Promise<ScrcpyClientLike>;
}

export interface SessionStateChange {
  readonly state: SessionStateKind;
  readonly detail?: string;
}

export interface VideoSize {
  readonly width: number;
  readonly height: number;
}

export interface IDeviceControl {
  touch(input: TouchInput): Promise<void>;
  scroll(input: ScrollInput): Promise<void>;
  key(input: KeyInput): Promise<void>;
  press(keyCode: AndroidKeyCode): Promise<void>;
  text(text: string): Promise<void>;
  back(): Promise<void>;
  home(): Promise<void>;
  recents(): Promise<void>;
  rotate(): Promise<void>;
  setScreenPower(on: boolean): Promise<void>;
  paste(text: string): Promise<void>;
}

export interface IMirrorSession extends IDisposable {
  readonly control: IDeviceControl;
  readonly onDeviceClipboard: Event<string>;
  readonly state: SessionStateKind;
  readonly videoConfig: VideoConfig | undefined;
  readonly onDidChangeState: Event<SessionStateChange>;
  readonly onDidChangeVideoConfig: Event<VideoConfig>;
  readonly onVideoPacket: Event<VideoPacket>;
  start(): Promise<void>;
  requestKeyframe(): Promise<void>;
}
