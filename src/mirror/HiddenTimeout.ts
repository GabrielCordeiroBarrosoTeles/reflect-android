import type { IDisposable } from '../core/types';

export class HiddenTimeout implements IDisposable {
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly delayMs: number,
    private readonly onTimeout: () => void,
  ) {}

  update(visible: boolean): void {
    if (visible) {
      this.cancel();
      return;
    }
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.onTimeout();
    }, this.delayMs);
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
