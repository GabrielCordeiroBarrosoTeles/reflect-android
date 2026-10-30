import type { MirrorEnvelope, WebviewToHostMessage } from '../shared/protocol';

export interface VsCodeApi {
  postMessage(message: MirrorEnvelope<WebviewToHostMessage>): void;
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
