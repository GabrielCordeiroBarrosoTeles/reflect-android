import { DisposableStore } from '../core/Disposable';
import type { IDisposable } from '../core/types';
import type { IActiveDeviceContext } from '../device/types';
import type { FrameStats, IPerformanceReader, PerformancePoint, PerformanceReading } from '../performance/types';
import type { PerformanceStatus } from '../shared/toolsProtocol';
import type { IToolsChannel } from './ToolsChannel';

export const MAX_POINTS = 60;

const KB_PER_MB = 1024;

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const round = (value: number): number => Math.round(value * 10) / 10;

export class PerformanceTab implements IDisposable {
  private readonly store = new DisposableStore();
  private points: PerformancePoint[] = [];
  private previous: { readonly time: number; readonly frames: FrameStats; readonly pid: number } | undefined;
  private app: string | undefined;
  private active = false;
  private paused = false;
  private status: PerformanceStatus = { kind: 'idle' };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;

  constructor(
    private readonly reader: IPerformanceReader,
    private readonly context: IActiveDeviceContext,
    private readonly channel: IToolsChannel,
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.store.add(
      context.onDidChange(() => {
        this.clear();
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

  async resetFrames(): Promise<void> {
    const device = this.context.mirroredDevice;
    if (device && this.app) {
      this.previous = undefined;
      await this.reader.resetFrames(device.serial, this.app).catch(() => undefined);
    }
  }

  sync(): void {
    this.channel.post({ type: 'performance-status', status: this.status });
    this.channel.post({ type: 'performance-points', points: this.points, reset: true });
  }

  dispose(): void {
    this.stop();
    this.store.dispose();
  }

  private clear(): void {
    this.points = [];
    this.previous = undefined;
    this.channel.post({ type: 'performance-points', points: [], reset: true });
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
    const reading = await this.reader.read(device.serial).then(
      (value): PerformanceReading | Error => value,
      (error: unknown) => new Error(errorMessage(error)),
    );
    if (generation !== this.generation) {
      return;
    }
    if (reading instanceof Error) {
      this.setStatus({ kind: 'failed', message: reading.message });
    } else {
      this.apply(reading);
    }
    this.timer = setTimeout(() => void this.poll(generation), this.intervalMs);
  }

  private apply({ app, pid, cpu, memoryKb, frames }: PerformanceReading): void {
    if (app === undefined || pid === undefined) {
      this.setStatus({ kind: 'no-app' });
      return;
    }
    if (this.app !== app) {
      this.clear();
    }
    this.app = app;
    this.setStatus({ kind: 'sampling', app });
    const time = this.now();
    const point = { time, cpu, memoryMb: memoryKb === undefined ? undefined : round(memoryKb / KB_PER_MB), ...this.frameRates(time, pid, frames) };
    this.points = [...this.points, point].slice(-MAX_POINTS);
    this.channel.post({ type: 'performance-points', points: [point], reset: false });
  }

  private frameRates(time: number, pid: number, frames: FrameStats | undefined): Pick<PerformancePoint, 'fps' | 'jank' | 'p50' | 'p90' | 'p99'> {
    const previous = this.previous;
    this.previous = frames && { time, frames, pid };
    if (!frames) {
      return { fps: undefined, jank: undefined, p50: undefined, p90: undefined, p99: undefined };
    }
    const percentiles = { p50: frames.p50, p90: frames.p90, p99: frames.p99 };
    const rendered = previous && previous.pid === pid ? frames.total - previous.frames.total : -1;
    if (!previous || rendered < 0 || time <= previous.time) {
      return { fps: undefined, jank: undefined, ...percentiles };
    }
    return {
      fps: round((rendered * 1000) / (time - previous.time)),
      jank: rendered === 0 ? 0 : round(((frames.janky - previous.frames.janky) / rendered) * 100),
      ...percentiles,
    };
  }

  private setStatus(status: PerformanceStatus): void {
    if (JSON.stringify(status) !== JSON.stringify(this.status)) {
      this.status = status;
      this.channel.post({ type: 'performance-status', status });
    }
  }
}
