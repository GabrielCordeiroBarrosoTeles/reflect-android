import type { ILogger } from '../../src/core/types';

export class FakeLogger implements ILogger {
  readonly infos: string[] = [];
  readonly errors: { message: string; error: unknown }[] = [];

  info(message: string): void {
    this.infos.push(message);
  }

  error(message: string, error?: unknown): void {
    this.errors.push({ message, error });
  }
}
