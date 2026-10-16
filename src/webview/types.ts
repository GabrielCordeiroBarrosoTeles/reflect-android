import type { WebviewToHostMessage } from '../shared/protocol';

export interface VsCodeApi {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export interface VideoRendererListener {
  onDecoderFailure(error: unknown): void;
  onResyncNeeded(): void;
}

declare global {
  function acquireVsCodeApi(): VsCodeApi;
}
