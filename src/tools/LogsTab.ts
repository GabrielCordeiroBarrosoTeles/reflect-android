import { DisposableStore } from '../core/Disposable';
import type { IDisposable } from '../core/types';
import type { IActiveDeviceContext } from '../device/types';
import type { ILogReader, LogLine, LogRead } from '../logs/types';
import type { LogsStatus } from '../shared/toolsProtocol';
import type { IToolsChannel } from './ToolsChannel';

export const MAX_LOG_LINES = 2_000;

const keyOf = ({ time, tid, tag, message }: Omit<LogLine, 'id'>): string => `${time}|${tid}|${tag}|${message}`;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class LogsTab implements IDisposable {
  private readonly store = new DisposableStore();
  private lines: LogLine[] = [];
  private nextId = 1;
  private since: string | undefined;
  private seenAtSince = new Set<string>();
  private pid: number | undefined;
  private active = false;
  private paused = false;
  private status: LogsStatus = { kind: 'idle' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(
    private readonly reader: ILogReader,
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

  clear(): void {
    this.lines = [];
    this.channel.post({ type: 'logs-lines', lines: [], reset: true });
  }

  sync(): void {
    this.channel.post({ type: 'logs-status', status: this.status });
    this.channel.post({ type: 'logs-lines', lines: this.lines, reset: true });
  }

  dispose(): void {
    this.stop();
    this.store.dispose();
  }

  private reset(): void {
    this.since = undefined;
    this.seenAtSince = new Set();
    this.pid = undefined;
    this.clear();
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
    const result = await this.reader.read(device.serial, this.since).then(
      (read): LogRead | Error => read,
      (error: unknown) => new Error(errorMessage(error)),
    );
    if (generation !== this.generation) {
      return;
    }
    if (result instanceof Error) {
      this.setStatus({ kind: 'failed', message: result.message });
    } else {
      this.apply(result);
    }
    this.timer = setTimeout(() => void this.poll(generation), this.intervalMs);
  }

  private apply({ app, pid, lines }: LogRead): void {
    if (app === undefined || pid === undefined) {
      this.setStatus({ kind: 'no-app' });
      return;
    }
    if (this.pid !== undefined && this.pid !== pid) {
      this.reset();
    }
    this.pid = pid;
    this.setStatus({ kind: 'capturing', app });
    const fresh = lines.filter((line) => line.time !== this.since || !this.seenAtSince.has(keyOf(line)));
    const last = fresh.at(-1);
    if (!last) {
      return;
    }
    if (last.time !== this.since) {
      this.seenAtSince = new Set();
    }
    this.since = last.time;
    fresh.filter((line) => line.time === last.time).forEach((line) => this.seenAtSince.add(keyOf(line)));
    const added = fresh.map((line) => ({ ...line, id: this.nextId++ }));
    this.lines = [...this.lines, ...added].slice(-MAX_LOG_LINES);
    this.channel.post({ type: 'logs-lines', lines: added, reset: false });
  }

  private setStatus(status: LogsStatus): void {
    if (JSON.stringify(status) !== JSON.stringify(this.status)) {
      this.status = status;
      this.channel.post({ type: 'logs-status', status });
    }
  }
}
