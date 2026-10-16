import { CommandIds } from './commandIds';
import type { ICommand } from './types';

export class RefreshDeviceInfoCommand implements ICommand {
  readonly id = CommandIds.refreshDeviceInfo;

  constructor(private readonly view: { refresh(): void }) {}

  execute(): Promise<void> {
    this.view.refresh();
    return Promise.resolve();
  }
}
