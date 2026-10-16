export class RetryBackoff {
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly baseDelayMs: number,
    private readonly maxDelayMs: number,
  ) {}

  schedule(action: () => void): void {
    if (this.timer !== undefined) {
      return;
    }
    const delay = Math.min(this.baseDelayMs * 2 ** this.attempt, this.maxDelayMs);
    this.attempt += 1;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      action();
    }, delay);
  }

  reset(): void {
    this.attempt = 0;
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}
