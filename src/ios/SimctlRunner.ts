import type { ISimctl, SimctlExecFile } from './types';

export class SimctlRunner implements ISimctl {
  constructor(
    private readonly execFile: SimctlExecFile,
    private readonly timeoutMs: number,
  ) {}

  run(args: readonly string[], input?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = this.execFile('xcrun', ['simctl', ...args], { timeout: this.timeoutMs }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
      if (input !== undefined) {
        child.stdin?.end(input);
      }
    });
  }
}
