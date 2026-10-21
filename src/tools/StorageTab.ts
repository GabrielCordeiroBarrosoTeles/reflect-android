import { DisposableStore } from '../core/Disposable';
import type { Event, IDisposable } from '../core/types';
import type { IActiveDeviceContext } from '../device/types';
import type { StoragePanelState } from '../shared/toolsProtocol';
import { parseStorageValue } from '../storage/storageValue';
import type { IStorageReader, StorageEntry, StorageResult } from '../storage/types';
import type { IToolsChannel } from './ToolsChannel';

export interface StorageServices {
  readonly reader: IStorageReader;
  readonly context: IActiveDeviceContext;
  readonly onDidChangeConnection: Event<boolean>;
  readonly isConnected: () => boolean;
  readonly confirm: (message: string, action: string) => Promise<boolean>;
  readonly notify: (message: string) => void;
}

type Device = NonNullable<IActiveDeviceContext['mirroredDevice']>;

const TIMED_OUT = 'The app did not answer in time.';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const toState = (result: StorageResult): StoragePanelState => {
  switch (result.status) {
    case 'ok':
      return { kind: 'loaded', entries: result.entries };
    case 'unavailable':
      return { kind: 'unavailable' };
    case 'error':
      return { kind: 'failed', message: result.message };
    case 'miss':
      return { kind: 'failed', message: TIMED_OUT };
  }
};

export class StorageTab implements IDisposable {
  private readonly store = new DisposableStore();
  private state: StoragePanelState = { kind: 'idle' };
  private generation = 0;

  constructor(
    private readonly services: StorageServices,
    private readonly channel: IToolsChannel,
  ) {
    this.store.add(
      services.onDidChangeConnection((connected) => {
        this.syncAvailability();
        if (connected && channel.isActive('storage')) {
          void this.refresh();
        }
      }),
    );
    this.store.add(services.context.onDidChange(() => channel.isActive('storage') && void this.refresh()));
  }

  snapshot(): Readonly<Record<string, unknown>> {
    return Object.fromEntries(this.entries().map(({ key, value }) => [key, parseStorageValue(value)]));
  }

  async refresh(): Promise<void> {
    await this.run((device) => this.services.reader.readAll(device));
  }

  async showNewKeyForm(): Promise<void> {
    await this.channel.reveal('storage');
    this.channel.post({ type: 'storage-new-key' });
  }

  async clear(): Promise<void> {
    const count = this.entries().length;
    if (await this.services.confirm(`Delete all ${count} keys from the app's AsyncStorage?`, 'Delete All')) {
      await this.run((device) => this.services.reader.clear(device));
    }
  }

  async remove(key: string): Promise<void> {
    if (await this.services.confirm(`Delete "${key}" from the app's AsyncStorage?`, 'Delete')) {
      await this.run((device) => this.services.reader.remove(device, key));
    }
  }

  async write(key: string, value: string, created: boolean): Promise<void> {
    const saved = await this.run((device) => this.services.reader.set(device, key, value));
    if (saved) {
      this.channel.post({ type: 'storage-saved', key });
      this.services.notify(`${created ? 'Created' : 'Saved'} "${key}"`);
    }
  }

  sync(): void {
    this.syncAvailability();
    this.channel.post({ type: 'storage-state', state: this.state });
  }

  dispose(): void {
    this.store.dispose();
  }

  private syncAvailability(): void {
    this.channel.post({ type: 'storage-available', available: this.services.isConnected() });
  }

  private entries(): readonly StorageEntry[] {
    return this.state.kind === 'loaded' ? this.state.entries : [];
  }

  private async run(operation: (device: Device) => Promise<StorageResult>): Promise<boolean> {
    this.generation += 1;
    const generation = this.generation;
    const device = this.services.context.mirroredDevice;
    if (!device) {
      this.show({ kind: 'idle' });
      return false;
    }
    this.channel.post({ type: 'storage-state', state: { kind: 'loading' } });
    const state = await operation(device).then(toState, (error: unknown): StoragePanelState => ({ kind: 'failed', message: errorMessage(error) }));
    if (generation !== this.generation) {
      return false;
    }
    this.show(state);
    return state.kind === 'loaded';
  }

  private show(state: StoragePanelState): void {
    this.state = state;
    this.channel.post({ type: 'storage-state', state });
  }
}
