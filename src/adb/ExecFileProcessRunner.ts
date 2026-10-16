import type { ExecFileFunction, ProcessRunner } from './types';

export class ExecFileProcessRunner implements ProcessRunner {
  constructor(
    private readonly execFile: ExecFileFunction,
    private readonly timeoutMs: number,
  ) {}

  async run(executable: string, args: readonly string[]): Promise<void> {
    await this.execFile(executable, [...args], { timeout: this.timeoutMs });
  }
}
