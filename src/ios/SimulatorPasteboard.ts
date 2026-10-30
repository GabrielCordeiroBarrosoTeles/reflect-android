import { Emitter } from '../core/Emitter';
import type { ISimctl, ISimulatorPasteboard } from './types';

export class SimulatorPasteboard implements ISimulatorPasteboard {
  private readonly changeEmitter = new Emitter<string>();
  private known: string | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly simctl: ISimctl,
    private readonly udid: string,
  ) {}

  poll(): Promise<void> {
    return this.exclusive(async () => {
      this.observe(await this.read());
    });
  }

  push(text: string, use: () => Promise<void>): Promise<void> {
    return this.exclusive(async () => {
      await this.write(text);
      await use();
    });
  }

  lend(text: string, use: () => Promise<void>): Promise<void> {
    return this.exclusive(async () => {
      const previous = await this.read().catch(() => undefined);
      if (previous !== undefined) {
        this.observe(previous);
      }
      await this.write(text);
      try {
        await use();
      } finally {
        if (previous !== undefined) {
          await this.write(previous);
        }
      }
    });
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private exclusive(task: () => Promise<void>): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private read(): Promise<string> {
    return this.simctl.run(['pbpaste', this.udid]);
  }

  private async write(text: string): Promise<void> {
    await this.simctl.run(['pbcopy', this.udid], text);
    this.known = text;
  }

  private observe(text: string): void {
    const changed = this.known !== undefined && text !== this.known && text !== '';
    this.known = text;
    if (changed) {
      this.changeEmitter.fire(text);
    }
  }
}
