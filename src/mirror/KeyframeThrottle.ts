export class KeyframeThrottle {
  private lastRequestAt = 0;

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  tryAcquire(): boolean {
    const current = this.now();
    if (current - this.lastRequestAt < this.minIntervalMs) {
      return false;
    }
    this.lastRequestAt = current;
    return true;
  }
}
