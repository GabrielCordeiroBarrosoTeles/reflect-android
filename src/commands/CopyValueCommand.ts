import type { IClipboard } from '../mirror/types';
import { CommandIds } from './commandIds';
import type { ICommand } from './types';

export class CopyValueCommand implements ICommand {
  readonly id = CommandIds.copyValue;

  constructor(
    private readonly clipboard: IClipboard,
    private readonly notify: (message: string) => void,
  ) {}

  async execute(value?: unknown): Promise<void> {
    if (typeof value !== 'string') {
      return;
    }
    await this.clipboard.writeText(value);
    this.notify(`Copied "${value}"`);
  }
}
