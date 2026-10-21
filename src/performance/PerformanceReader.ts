import type { IDeviceShell } from '../device/types';
import { parsePerformance, PERFORMANCE_COMMAND, resetFramesCommand } from './performanceParsers';
import type { IPerformanceReader, PerformanceReading } from './types';

export class PerformanceReader implements IPerformanceReader {
  constructor(private readonly shell: IDeviceShell) {}

  async read(serial: string): Promise<PerformanceReading> {
    return parsePerformance(await this.shell.run(serial, PERFORMANCE_COMMAND));
  }

  async resetFrames(serial: string, app: string): Promise<void> {
    const command = resetFramesCommand(app);
    if (command) {
      await this.shell.run(serial, command);
    }
  }
}
