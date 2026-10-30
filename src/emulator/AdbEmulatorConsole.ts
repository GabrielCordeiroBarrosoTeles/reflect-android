import type { IAdbLocator } from '../adb/types';
import type { EmulatorExecFile, IEmulatorConsole } from './types';

const REFUSED = /^KO:\s*(.*)$/;

const parseReply = (stdout: string): string => {
  const lines = stdout.split(/\r?\n/).map((line) => line.trimEnd());
  const refusal = lines.map((line) => REFUSED.exec(line)).find((match) => match !== null);
  if (refusal) {
    throw new Error(`Emulator console: ${refusal[1]}`);
  }
  return lines.filter((line) => line !== 'OK' && line !== '').join('\n');
};

export class AdbEmulatorConsole implements IEmulatorConsole {
  constructor(
    private readonly locator: IAdbLocator,
    private readonly execFile: EmulatorExecFile,
    private readonly timeoutMs: number,
  ) {}

  async run(serial: string, args: readonly string[]): Promise<string> {
    const adb = await this.locator.locate();
    const stdout = await new Promise<string>((resolve, reject) => {
      this.execFile(adb, ['-s', serial, 'emu', ...args], { timeout: this.timeoutMs }, (error, output) => (error ? reject(error) : resolve(output)));
    });
    return parseReply(stdout);
  }
}
