import { Emitter } from '../../src/core/Emitter';
import type { CdpEvent, ICdpSession } from '../../src/inspector/types';

export class FakeCdpSession implements ICdpSession {
  readonly events = new Emitter<CdpEvent>();
  readonly closes = new Emitter<void>();
  readonly onEvent = this.events.event;
  readonly onDidClose = this.closes.event;
  readonly calls: { method: string; params: Record<string, unknown> | undefined }[] = [];
  disposed = 0;
  handler: (method: string, params: Record<string, unknown> | undefined) => unknown = () => ({});

  send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    this.calls.push({ method, params });
    try {
      return Promise.resolve(this.handler(method, params));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  emitDevTools(event: string, payload: unknown, domain = 'react-devtools'): void {
    this.events.fire({
      method: 'Runtime.bindingCalled',
      params: { name: '__CHROME_DEVTOOLS_FRONTEND_BINDING__', payload: JSON.stringify({ domain, message: { event, payload } }) },
    });
  }

  dispose(): void {
    this.disposed += 1;
  }
}
