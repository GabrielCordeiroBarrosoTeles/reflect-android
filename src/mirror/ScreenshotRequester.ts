import type { IDisposable } from '../core/types';
import type { IWebviewChannel } from './types';

interface PendingCapture {
  readonly resolve: (data: Uint8Array | undefined) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class ScreenshotRequester implements IDisposable {
  private readonly pending = new Map<number, PendingCapture>();
  private nextId = 0;

  constructor(
    private readonly channel: IWebviewChannel,
    private readonly timeoutMs: number,
  ) {}

  request(): Promise<Uint8Array | undefined> {
    this.nextId += 1;
    const requestId = this.nextId;
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(requestId, undefined), this.timeoutMs);
      this.pending.set(requestId, { resolve, timer });
      this.channel.post({ type: 'capture-screenshot', requestId });
    });
  }

  resolve(requestId: number, data: Uint8Array | undefined): void {
    this.settle(requestId, data);
  }

  dispose(): void {
    for (const requestId of [...this.pending.keys()]) {
      this.settle(requestId, undefined);
    }
  }

  private settle(requestId: number, data: Uint8Array | undefined): void {
    const capture = this.pending.get(requestId);
    if (!capture) {
      return;
    }
    this.pending.delete(requestId);
    clearTimeout(capture.timer);
    capture.resolve(data);
  }
}
