import type { WebviewToHostMessage } from '../../shared/protocol';

export type MessageSink = (message: WebviewToHostMessage) => void;

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
  readonly inside: boolean;
}

export interface ContentRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Disposable {
  dispose(): void;
}

export interface InspectModeState {
  readonly active: boolean;
}
