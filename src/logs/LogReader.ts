import type { IDeviceShell } from '../device/types';
import { buildLogcatCommand, parseLogcat } from './logcat';
import type { ILogReader, LogRead } from './types';

export class LogReader implements ILogReader {
  constructor(private readonly shell: IDeviceShell) {}

  async read(serial: string, since: string | undefined): Promise<LogRead> {
    return parseLogcat(await this.shell.run(serial, buildLogcatCommand(since)));
  }
}
