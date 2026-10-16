export class FrameScheduler {
  private readonly tasks = new Map<string, () => void>();
  private frame: number | undefined;

  schedule(key: string, task: () => void): void {
    this.tasks.set(key, task);
    this.frame ??= requestAnimationFrame(() => this.flush());
  }

  flushNow(key: string): void {
    const task = this.tasks.get(key);
    if (!task) {
      return;
    }
    this.tasks.delete(key);
    task();
  }

  dispose(): void {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }
    this.frame = undefined;
    this.tasks.clear();
  }

  private flush(): void {
    this.frame = undefined;
    const tasks = [...this.tasks.values()];
    this.tasks.clear();
    for (const task of tasks) {
      task();
    }
  }
}
