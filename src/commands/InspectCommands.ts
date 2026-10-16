import type { InspectController } from '../inspector/InspectController';
import type { SourceLocation } from '../inspector/types';
import { CommandIds } from './commandIds';
import type { ICommand } from './types';

export class InspectCommand implements ICommand {
  readonly id = CommandIds.inspect;

  constructor(
    private readonly controller: InspectController,
    private readonly hasMirror: () => boolean,
    private readonly openDevice: () => Promise<unknown>,
  ) {}

  async execute(): Promise<void> {
    if (!this.hasMirror()) {
      await this.openDevice();
    }
    if (this.hasMirror()) {
      this.controller.start();
    }
  }
}

export class StopInspectingCommand implements ICommand {
  readonly id = CommandIds.stopInspecting;

  constructor(private readonly controller: InspectController) {}

  execute(): Promise<void> {
    this.controller.cancel();
    return Promise.resolve();
  }
}

const isSourceLocation = (value: unknown): value is SourceLocation =>
  typeof value === 'object' && value !== null && typeof (value as SourceLocation).file === 'string' && typeof (value as SourceLocation).line === 'number';

export class OpenComponentSourceCommand implements ICommand {
  readonly id = CommandIds.openComponentSource;

  constructor(private readonly open: (source: SourceLocation) => Promise<void>) {}

  async execute(source?: unknown): Promise<void> {
    if (isSourceLocation(source)) {
      await this.open(source);
    }
  }
}
