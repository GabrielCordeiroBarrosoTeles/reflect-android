import type { Event, IDisposable } from '../core/types';

export interface DeviceAvailability {
  readonly onDidChange: Event<void>;
  isReady(serial: string): boolean;
}

export interface ReconnectTiming {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly giveUpAfterMs: number;
}

export interface AutoReconnectOptions {
  readonly serial: string;
  readonly availability: DeviceAvailability;
  readonly timing: ReconnectTiming;
  readonly reconnect: () => Promise<void>;
  readonly onGiveUp: () => void;
  readonly now?: () => number;
}

export class AutoReconnect implements IDisposable {
  private readonly now: () => number;
  private subscription: IDisposable | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline = 0;
  private failures = 0;
  private attempting = false;

  constructor(private readonly options: AutoReconnectOptions) {
    this.now = options.now ?? Date.now;
  }

  get active(): boolean {
    return this.subscription !== undefined;
  }

  start(): void {
    if (this.active) {
      return;
    }
    this.deadline = this.now() + this.options.timing.giveUpAfterMs;
    this.failures = 0;
    this.subscription = this.options.availability.onDidChange(() => this.attempt());
    this.attempt();
  }

  stop(): void {
    this.subscription?.dispose();
    this.subscription = undefined;
    clearTimeout(this.timer);
    this.timer = undefined;
  }

  dispose(): void {
    this.stop();
  }

  private attempt(): void {
    if (!this.active || this.attempting) {
      return;
    }
    if (this.now() >= this.deadline) {
      this.stop();
      this.options.onGiveUp();
      return;
    }
    if (!this.options.availability.isReady(this.options.serial)) {
      this.schedule(this.options.timing.maxDelayMs);
      return;
    }
    this.attempting = true;
    this.options.reconnect().then(
      () => {
        this.attempting = false;
        this.stop();
      },
      () => {
        this.attempting = false;
        this.failures += 1;
        this.schedule(Math.min(this.options.timing.baseDelayMs * 2 ** (this.failures - 1), this.options.timing.maxDelayMs));
      },
    );
  }

  private schedule(delayMs: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.attempt(), Math.min(delayMs, Math.max(0, this.deadline - this.now())));
  }
}
