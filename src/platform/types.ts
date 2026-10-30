import type { Event, IDisposable } from '../core/types';
import type { Device, Platform } from '../devices/types';
import type { ActionId } from '../shared/actions';
import type { KeyInput, ScrollInput, SessionStateKind, TouchInput, VideoConfig, VideoPacket } from '../shared/protocol';
import type { ToolsTab } from '../shared/toolsProtocol';

export type HardwareButton = 'back' | 'home' | 'recents' | 'menu' | 'lock' | 'volumeUp' | 'volumeDown' | 'siri' | 'shake';

export interface IDeviceControl {
  touch(input: TouchInput): Promise<void>;
  scroll(input: ScrollInput): Promise<void>;
  key(input: KeyInput): Promise<void>;
  text(text: string): Promise<void>;
  paste(text: string): Promise<void>;
  reloadShortcut(): Promise<void>;
  pressButton(button: HardwareButton): Promise<void>;
  rotate(): Promise<void>;
  setScreenPower(on: boolean): Promise<void>;
}

export interface SessionStateChange {
  readonly state: SessionStateKind;
  readonly detail?: string;
}

export interface VideoSize {
  readonly width: number;
  readonly height: number;
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

export interface PlatformCapabilities {
  readonly actions: readonly ActionId[];
  readonly tools: readonly ToolsTab[];
}

export interface IPlatform {
  readonly id: Platform;
  capabilities(device: Device): PlatformCapabilities;
  createMirrorSession(device: Device): IMirrorSession;
}
