import type { ProcessRunner } from '../adb/types';
import { Emitter } from '../core/Emitter';
import type { IDisposable, ILogger } from '../core/types';
import type { HelperCommand } from './types';

type SimulatorWindowMode = 'hide' | 'quit' | 'leave';

const MODES: readonly SimulatorWindowMode[] = ['hide', 'quit', 'leave'];

const toMode = (value: unknown): SimulatorWindowMode => MODES.find((mode) => mode === value) ?? 'quit';

export class SimulatorAppWindow implements IDisposable {
  private readonly hiddenEmitter = new Emitter<boolean>();
  private isHidden = false;

  readonly onDidChangeHidden = this.hiddenEmitter.event;

  constructor(
    private readonly readMode: () => unknown,
    private readonly runner: ProcessRunner,
    private readonly logger: ILogger,
  ) {}

  get hidden(): boolean {
    return this.isHidden;
  }

  async makeRoom(sendToHelper: (command: HelperCommand) => void): Promise<void> {
    const mode = toMode(this.readMode());
    this.logger.info(`Simulator app window: ${mode}`);
    if (mode !== 'leave') {
      sendToHelper({ type: 'simulatorApp', action: mode });
      this.setHidden(true);
    }
  }

  async show(): Promise<void> {
    await this.runner.run('open', ['-a', 'Simulator']);
    this.setHidden(false);
  }

  dispose(): void {
    this.hiddenEmitter.dispose();
  }

  private setHidden(hidden: boolean): void {
    if (hidden !== this.isHidden) {
      this.isHidden = hidden;
      this.hiddenEmitter.fire(hidden);
    }
  }
}
