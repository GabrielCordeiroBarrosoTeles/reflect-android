import type { ProcessRunner } from '../../src/adb/types';

export class FakeProcessRunner implements ProcessRunner {
  readonly calls: { executable: string; args: readonly string[] }[] = [];
  failure: Error | undefined;
  onRun: (() => void) | undefined;

  run(executable: string, args: readonly string[]): Promise<void> {
    this.calls.push({ executable, args });
    this.onRun?.();
    return this.failure ? Promise.reject(this.failure) : Promise.resolve();
  }
}
