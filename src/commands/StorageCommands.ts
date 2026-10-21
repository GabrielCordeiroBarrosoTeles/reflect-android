import type { IClipboard } from '../mirror/types';
import { CommandIds } from './commandIds';
import type { ICommand } from './types';

export interface IStoragePanel {
  refresh(): Promise<void>;
  clear(): Promise<void>;
  showNewKeyForm(): Promise<void>;
  snapshot(): Readonly<Record<string, unknown>>;
}

export class RefreshStorageCommand implements ICommand {
  readonly id = CommandIds.refreshStorage;

  constructor(private readonly panel: IStoragePanel) {}

  execute(): Promise<void> {
    return this.panel.refresh();
  }
}

export class AddStorageKeyCommand implements ICommand {
  readonly id = CommandIds.addStorageKey;

  constructor(private readonly panel: IStoragePanel) {}

  execute(): Promise<void> {
    return this.panel.showNewKeyForm();
  }
}

export class ClearStorageCommand implements ICommand {
  readonly id = CommandIds.clearStorage;

  constructor(private readonly panel: IStoragePanel) {}

  execute(): Promise<void> {
    return this.panel.clear();
  }
}

export class CopyStorageJsonCommand implements ICommand {
  readonly id = CommandIds.copyStorageJson;

  constructor(
    private readonly panel: IStoragePanel,
    private readonly clipboard: IClipboard,
    private readonly notify: (message: string) => void,
  ) {}

  async execute(): Promise<void> {
    const snapshot = this.panel.snapshot();
    await this.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    this.notify(`Copied ${Object.keys(snapshot).length} AsyncStorage keys as JSON`);
  }
}
