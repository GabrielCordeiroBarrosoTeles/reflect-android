import type { ProcessRunner } from '../adb/types';
import { Emitter } from '../core/Emitter';
import type { IDisposable, ILogger } from '../core/types';
import type { HelperCommand } from './types';

type SimulatorWindowMode = 'hide' | 'quit' | 'leave';

const MODES: readonly SimulatorWindowMode[] = ['hide', 'quit', 'leave'];

const toMode = (value: unknown): SimulatorWindowMode => MODES.find((mode) => mode === value) ?? 'hide';

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
    if (mode === 'hide') {
      sendToHelper({ type: 'simulatorApp', action: 'hide' });
      this.setHidden(true);
    }
    if (mode === 'quit') {
      await this.quit();
    }
  }

  async show(): Promise<void> {
    await this.runner.run('open', ['-a', 'Simulator']);
    this.setHidden(false);
  }

  dispose(): void {
    this.hiddenEmitter.dispose();
  }

  private async quit(): Promise<void> {
    try {
      await this.runner.run('osascript', ['-e', 'quit app "Simulator"']);
      this.setHidden(true);
    } catch (error) {
      this.logger.error('Could not quit the Simulator app', error);
    }
  }

  private setHidden(hidden: boolean): void {
    if (hidden !== this.isHidden) {
      this.isHidden = hidden;
      this.hiddenEmitter.fire(hidden);
    }
  }
}
