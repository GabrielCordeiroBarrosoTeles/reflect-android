import { DisposableStore } from '../core/Disposable';
import type { IDisposable } from '../core/types';
import type { IActiveDeviceContext } from '../device/types';
import type { INetworkReader, NetworkEntry, NetworkResult } from '../network/types';
import type { NetworkStatus } from '../shared/toolsProtocol';
import type { IToolsChannel } from './ToolsChannel';

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class NetworkTab implements IDisposable {
  private readonly store = new DisposableStore();
  private readonly entries = new Map<number, NetworkEntry>();
  private revision = 0;
  private active = false;
  private paused = false;
  private status: NetworkStatus = { kind: 'idle' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(
    private readonly reader: INetworkReader,
    private readonly context: IActiveDeviceContext,
    private readonly channel: IToolsChannel,
    private readonly intervalMs: number,
  ) {
    this.store.add(
      context.onDidChange(() => {
        this.reset();
        this.restart();
      }),
    );
  }

  setActive(active: boolean): void {
    if (active !== this.active) {
      this.active = active;
      this.restart();
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.restart();
  }

  async clear(): Promise<void> {
    this.reset();
    const device = this.context.mirroredDevice;
    if (device) {
      await this.reader.clear(device).catch(() => undefined);
    }
  }

  sync(): void {
    this.channel.post({ type: 'network-status', status: this.status });
    this.channel.post({ type: 'network-entries', entries: [...this.entries.values()], reset: true });
  }

  dispose(): void {
    this.stop();
    this.store.dispose();
  }

  private reset(): void {
    this.entries.clear();
    this.revision = 0;
    this.channel.post({ type: 'network-entries', entries: [], reset: true });
  }

  private restart(): void {
    this.stop();
    if (this.paused) {
      this.setStatus({ kind: 'paused' });
      return;
    }
    if (this.active) {
      void this.poll(this.generation);
    }
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.generation += 1;
  }

  private async poll(generation: number): Promise<void> {
    const device = this.context.mirroredDevice;
    if (!device) {
      this.setStatus({ kind: 'idle' });
      return;
    }
    const result = await this.reader.read(device, this.revision).catch((error: unknown): NetworkResult => ({ status: 'error', message: errorMessage(error) }));
    if (generation !== this.generation) {
      return;
    }
    this.apply(result);
    this.timer = setTimeout(() => void this.poll(generation), this.intervalMs);
  }

  private apply(result: NetworkResult): void {
    if (result.status !== 'ok') {
      this.setStatus(result.status === 'unavailable' ? { kind: 'unavailable' } : { kind: 'failed', message: result.message });
      return;
    }
    const restarted = result.revision < this.revision;
    if (restarted) {
      this.entries.clear();
    }
    this.revision = result.revision;
    this.setStatus({ kind: 'capturing' });
    result.entries.forEach((entry) => this.entries.set(entry.id, entry));
    if (restarted || result.entries.length > 0) {
      this.channel.post({ type: 'network-entries', entries: restarted ? [...this.entries.values()] : result.entries, reset: restarted });
    }
  }

  private setStatus(status: NetworkStatus): void {
    if (JSON.stringify(status) !== JSON.stringify(this.status)) {
      this.status = status;
      this.channel.post({ type: 'network-status', status });
    }
  }
}
