import { Emitter } from '../core/Emitter';
import type { IDisposable, ILogger } from '../core/types';
import type { IAppVisibility, IEmulatorConsole } from './types';

type EmulatorWindowMode = 'hide' | 'leave';

const toMode = (value: unknown): EmulatorWindowMode => (value === 'leave' ? 'leave' : 'hide');

const PID_FILE = /pid_(\d+)\.ini/;

export class EmulatorWindows implements IDisposable {
  private readonly changeEmitter = new Emitter<void>();
  private readonly hidden = new Set<string>();

  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly readMode: () => unknown,
    private readonly console: IEmulatorConsole,
    private readonly apps: IAppVisibility,
    private readonly logger: ILogger,
  ) {}

  isHidden(serial: string): boolean {
    return this.hidden.has(serial);
  }

  async hide(serial: string): Promise<void> {
    const mode = toMode(this.readMode());
    this.logger.info(`Emulator window of ${serial}: ${mode}`);
    if (mode === 'leave') {
      return;
    }
    try {
      await this.hideWindow(serial);
    } catch (error) {
      this.logger.error(`Could not hide the window of ${serial}`, error);
    }
  }

  async show(serial: string): Promise<void> {
    await this.apps.unhide(await this.pidOf(serial));
    this.setHidden(serial, false);
  }

  retain(serials: readonly string[]): void {
    const gone = [...this.hidden].filter((serial) => !serials.includes(serial));
    gone.forEach((serial) => this.hidden.delete(serial));
    if (gone.length > 0) {
      this.changeEmitter.fire();
    }
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private async hideWindow(serial: string): Promise<void> {
    const windowType = await this.console.run(serial, ['avd', 'windowtype']);
    if (!windowType.includes('qtwindow')) {
      this.logger.info(`Emulator ${serial} has no window to hide`);
      return;
    }
    await this.apps.hide(await this.pidOf(serial));
    this.setHidden(serial, true);
  }

  private async pidOf(serial: string): Promise<number> {
    const match = PID_FILE.exec(await this.console.run(serial, ['avd', 'discoverypath']));
    if (!match) {
      throw new Error(`No emulator process for ${serial}`);
    }
    return Number(match[1]);
  }

  private setHidden(serial: string, hidden: boolean): void {
    if (hidden) {
      this.hidden.add(serial);
    } else {
      this.hidden.delete(serial);
    }
    this.changeEmitter.fire();
  }
}
