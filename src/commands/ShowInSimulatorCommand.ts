import { CommandIds } from './commandIds';
import type { ICommand } from './types';

interface SimulatorWindow {
  show(): Promise<void>;
}

interface ErrorSink {
  present(error: unknown): Promise<void>;
}

export class ShowInSimulatorCommand implements ICommand {
  readonly id = CommandIds.showInSimulator;

  constructor(
    private readonly window: SimulatorWindow,
    private readonly errors: ErrorSink,
  ) {}

  async execute(): Promise<void> {
    try {
      await this.window.show();
    } catch (error) {
      await this.errors.present(error);
    }
  }
}
