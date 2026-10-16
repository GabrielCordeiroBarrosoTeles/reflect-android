export type SessionStateKind = 'idle' | 'connecting' | 'streaming' | 'disconnected' | 'error' | 'closed';

export interface VideoConfig {
  readonly codec: number;
  readonly width: number;
  readonly height: number;
}

export interface VideoPacket {
  readonly kind: 'configuration' | 'data';
  readonly data: Uint8Array;
  readonly keyframe: boolean | undefined;
  readonly pts: number | undefined;
}

export type HostToWebviewMessage =
  | { readonly type: 'idle' }
  | { readonly type: 'inspect-mode'; readonly active: boolean }
  | { readonly type: 'session-state'; readonly state: SessionStateKind; readonly deviceName: string; readonly detail?: string }
  | { readonly type: 'video-config'; readonly config: VideoConfig }
  | { readonly type: 'video-packet'; readonly packet: VideoPacket };

export type LogLevel = 'info' | 'error';

export type TouchAction = 'down' | 'move' | 'up' | 'cancel';

export type PointerKind = 'primary' | 'virtual';

export interface TouchInput {
  readonly action: TouchAction;
  readonly pointer: PointerKind;
  readonly x: number;
  readonly y: number;
}

export interface ScrollInput {
  readonly x: number;
  readonly y: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

export interface KeyModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
}

export interface KeyInput {
  readonly action: 'down' | 'up';
  readonly code: string;
  readonly repeat: number;
  readonly modifiers: KeyModifiers;
}

export type MouseShortcut = 'back' | 'home';

export type WebviewToHostMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'resync' }
  | { readonly type: 'touch'; readonly input: TouchInput }
  | { readonly type: 'scroll'; readonly input: ScrollInput }
  | { readonly type: 'key'; readonly input: KeyInput }
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'paste' }
  | { readonly type: 'mouse-shortcut'; readonly shortcut: MouseShortcut }
  | { readonly type: 'open-device' }
  | { readonly type: 'inspect-at'; readonly x: number; readonly y: number }
  | { readonly type: 'inspect-cancel' }
  | { readonly type: 'log'; readonly level: LogLevel; readonly message: string };
