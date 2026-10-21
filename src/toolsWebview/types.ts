import type { ToolsToHostMessage } from '../shared/toolsProtocol';

export type PostToolsMessage = (message: ToolsToHostMessage) => void;

export interface ToolsApi {
  postMessage(message: ToolsToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
}
