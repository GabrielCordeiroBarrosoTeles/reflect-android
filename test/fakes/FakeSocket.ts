import { Emitter } from '../../src/core/Emitter';
import type { ISocket } from '../../src/inspector/types';

export class FakeSocket implements ISocket {
  readonly opens = new Emitter<void>();
  readonly messages = new Emitter<string>();
  readonly closes = new Emitter<void>();
  readonly onOpen = this.opens.event;
  readonly onMessage = this.messages.event;
  readonly onClose = this.closes.event;
  readonly sent: Record<string, unknown>[] = [];
  closed = 0;
  respond: ((request: Record<string, unknown>) => unknown) | undefined;

  constructor(readonly origin = '') {}

  send(data: string): void {
    const request = JSON.parse(data) as Record<string, unknown>;
    this.sent.push(request);
    const reply = this.respond?.(request);
    if (reply !== undefined) {
      queueMicrotask(() => this.messages.fire(JSON.stringify(reply)));
    }
  }

  close(): void {
    this.closed += 1;
    this.closes.fire();
  }
}
