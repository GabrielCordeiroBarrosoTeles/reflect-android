import { DisposableStore } from '../core/Disposable';
import { Emitter } from '../core/Emitter';
import type { CdpEvent, ICdpSession, ISocket, SocketFactory } from './types';

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface CdpMessage {
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly message?: string };
}

export class CdpSession implements ICdpSession {
  private readonly eventEmitter = new Emitter<CdpEvent>();
  private readonly closeEmitter = new Emitter<void>();
  private readonly store = new DisposableStore();
  private readonly pending = new Map<number, PendingRequest>();
  private readonly opened: Promise<void>;
  private nextId = 0;
  private closed = false;

  readonly onEvent = this.eventEmitter.event;
  readonly onDidClose = this.closeEmitter.event;

  constructor(
    private readonly socket: ISocket,
    private readonly timeoutMs: number,
  ) {
    this.opened = new Promise<void>((resolve, reject) => {
      this.store.add(socket.onOpen(() => resolve()));
      this.store.add(socket.onClose(() => reject(new Error('Debugger connection closed'))));
    });
    this.opened.catch(() => undefined);
    this.store.add(socket.onMessage((data) => this.handleMessage(data)));
    this.store.add(socket.onClose(() => this.handleClose()));
  }

  static async connect(url: string, origins: readonly string[], createSocket: SocketFactory, timeoutMs: number): Promise<CdpSession> {
    let lastError: unknown = new Error('No origin to try');
    for (const origin of origins) {
      const session = new CdpSession(createSocket(url, origin), timeoutMs);
      try {
        await session.opened;
        await session.send('Runtime.evaluate', { expression: '1' });
        return session;
      } catch (error) {
        lastError = error;
        session.dispose();
      }
    }
    throw lastError;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error('Debugger connection closed'));
    }
    this.nextId += 1;
    const id = this.nextId;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => this.settle(id, new Error(`${method} timed out`)), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  dispose(): void {
    if (!this.closed) {
      this.socket.close();
    }
    this.handleClose();
  }

  private handleMessage(data: string): void {
    let message: CdpMessage;
    try {
      message = JSON.parse(data) as CdpMessage;
    } catch {
      return;
    }
    if (message.id !== undefined) {
      this.settle(message.id, message.error ? new Error(message.error.message ?? 'CDP error') : undefined, message.result);
      return;
    }
    if (message.method) {
      this.eventEmitter.fire({ method: message.method, params: message.params });
    }
  }

  private settle(id: number, error: Error | undefined, result?: unknown): void {
    const request = this.pending.get(id);
    if (!request) {
      return;
    }
    this.pending.delete(id);
    clearTimeout(request.timer);
    if (error) {
      request.reject(error);
      return;
    }
    request.resolve(result);
  }

  private handleClose(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const id of [...this.pending.keys()]) {
      this.settle(id, new Error('Debugger connection closed'));
    }
    this.closeEmitter.fire();
    this.store.dispose();
    this.eventEmitter.dispose();
    this.closeEmitter.dispose();
  }
}
