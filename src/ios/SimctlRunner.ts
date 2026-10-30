import type { ISimctl, SimctlExecFile, SimctlFiles } from './types';

export class SimctlRunner implements ISimctl {
  constructor(
    private readonly execFile: SimctlExecFile,
    private readonly timeoutMs: number,
    private readonly files: SimctlFiles,
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

  async screenshot(udid: string): Promise<Uint8Array> {
    const path = this.files.tempPath('reflect-screenshot');
    try {
      await this.run(['io', udid, 'screenshot', '--type=png', path]);
      return await this.files.readFile(path);
    } finally {
      await this.files.rm(path).catch(() => undefined);
    }
  }
}
