import { vi } from 'vitest';
import type { HostToToolsMessage, ToolsTab } from '../../src/shared/toolsProtocol';
import type { IToolsChannel } from '../../src/tools/ToolsChannel';

export class FakeToolsChannel implements IToolsChannel {
  readonly posted: HostToToolsMessage[] = [];
  active: ToolsTab | undefined = 'storage';
  readonly reveal = vi.fn((_tab: ToolsTab) => Promise.resolve());

  post(message: HostToToolsMessage): void {
    this.posted.push(message);
  }

  isActive(tab: ToolsTab): boolean {
    return this.active === tab;
  }

  last<T extends HostToToolsMessage['type']>(type: T): Extract<HostToToolsMessage, { type: T }> | undefined {
    return [...this.posted].reverse().find((message): message is Extract<HostToToolsMessage, { type: T }> => message.type === type);
  }
}
