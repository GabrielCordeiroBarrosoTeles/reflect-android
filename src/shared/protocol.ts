import type { ActionId } from './actions';

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

export interface ToolbarState {
  readonly recordingSince: number | undefined;
  readonly screenOff: boolean;
}

export interface BoxEdges {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface InspectHighlight {
  readonly name: string;
  readonly owner: string | undefined;
  readonly location: string | undefined;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly margin: BoxEdges;
  readonly padding: BoxEdges;
}

export type HostToWebviewMessage =
  | { readonly type: 'idle' }
  | { readonly type: 'toolbar-state'; readonly state: ToolbarState }
  | { readonly type: 'capture-screenshot'; readonly requestId: number }
  | { readonly type: 'inspect-mode'; readonly active: boolean }
  | { readonly type: 'inspect-highlight'; readonly highlight: InspectHighlight | undefined }
  | {
      readonly type: 'session-state';
      readonly state: SessionStateKind;
      readonly deviceName: string;
      readonly detail?: string;
      readonly canReconnect?: boolean;
    }
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
  | { readonly type: 'reconnect' }
  | { readonly type: 'inspect-at'; readonly x: number; readonly y: number }
  | { readonly type: 'inspect-hover'; readonly x: number; readonly y: number }
  | { readonly type: 'inspect-cancel' }
  | { readonly type: 'action'; readonly id: ActionId }
  | { readonly type: 'screenshot'; readonly requestId: number; readonly data: Uint8Array | undefined }
  | { readonly type: 'log'; readonly level: LogLevel; readonly message: string };
