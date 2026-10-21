import type { HostToToolsMessage, ToolsTab } from '../shared/toolsProtocol';

export interface IToolsChannel {
  post(message: HostToToolsMessage): void;
  reveal(tab: ToolsTab): Promise<void>;
  isActive(tab: ToolsTab): boolean;
}
