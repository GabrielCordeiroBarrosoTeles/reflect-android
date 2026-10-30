import { CommandIds } from './commandIds';
import type { ICommand } from './types';

interface DeviceWindows {
  show(deviceId: string): Promise<void>;
}

interface ErrorSink {
  present(error: unknown): Promise<void>;
}

export class ShowDeviceWindowCommand implements ICommand {
  readonly id = CommandIds.showDeviceWindow;

  constructor(
    private readonly windows: DeviceWindows,
    private readonly errors: ErrorSink,
  ) {}

  async execute(deviceId?: unknown): Promise<void> {
    if (typeof deviceId !== 'string') {
      return;
    }
    try {
      await this.windows.show(deviceId);
    } catch (error) {
      await this.errors.present(error);
    }
  }
}
