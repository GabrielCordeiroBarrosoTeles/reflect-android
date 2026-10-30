import { Emitter } from '../core/Emitter';
import type { ProcessRunner } from '../adb/types';
import type { ILogger } from '../core/types';
import { IosHelperUnavailableError } from '../core/errors';
import { clearQuarantine } from './clearQuarantine';
import { HelperFrameParser } from './HelperFrameParser';
import type { ChildProcessLike, HelperCommand, HelperFrame, HelperProcessFactory, IHelperProcess, SpawnFunction } from './types';

const KILL_DELAY_MS = 1000;
const HELPER_FPS = 60;
const HELPER_BITRATE = 8_000_000;
const HELPER_MAX_SIZE = 1920;

export class HelperProcess implements IHelperProcess {
  private readonly parser = new HelperFrameParser();
  private readonly frameEmitter = new Emitter<HelperFrame>();
  private readonly exitEmitter = new Emitter<{ code: number | null }>();
  private killTimer: ReturnType<typeof setTimeout> | undefined;
  private stderrRemainder = '';
  private exited = false;

  readonly onFrame = this.frameEmitter.event;
  readonly onExit = this.exitEmitter.event;

  constructor(
    private readonly child: ChildProcessLike,
    private readonly logger: ILogger,
  ) {
    child.stdout.on('data', (chunk) => this.parser.push(chunk).forEach((frame) => this.frameEmitter.fire(frame)));
    child.stderr.on('data', (chunk) => this.logStderr(chunk));
    child.on('exit', (code) => this.handleExit(code));
    child.on('error', (error) => {
      this.logger.error('iOS helper failed', error);
      this.handleExit(null);
    });
  }

  send(command: HelperCommand): void {
    if (!this.exited) {
      this.child.stdin.write(`${JSON.stringify(command)}\n`);
    }
  }

  dispose(): void {
    if (this.exited || this.killTimer) {
      return;
    }
    this.send({ type: 'stop' });
    this.killTimer = setTimeout(() => this.child.kill(), KILL_DELAY_MS);
  }

  private handleExit(code: number | null): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    clearTimeout(this.killTimer);
    this.exitEmitter.fire({ code });
  }

  private logStderr(chunk: Uint8Array): void {
    const lines = `${this.stderrRemainder}${new TextDecoder().decode(chunk)}`.split('\n');
    this.stderrRemainder = lines.pop() as string;
    lines.filter((line) => line.length > 0).forEach((line) => this.logger.info(`[ios-helper] ${line}`));
  }
}

export interface HelperProcessFactoryDeps {
  readonly helperPath: string;
  readonly assertExecutable: (path: string) => Promise<void>;
  readonly runner: ProcessRunner;
  readonly spawn: SpawnFunction;
  readonly logger: ILogger;
}

export const createHelperProcessFactory =
  ({ helperPath, assertExecutable, runner, spawn, logger }: HelperProcessFactoryDeps): HelperProcessFactory =>
  async (udid) => {
    await assertExecutable(helperPath).catch((error: unknown) => {
      throw new IosHelperUnavailableError(helperPath, error);
    });
    await clearQuarantine(runner, helperPath);
    const args = ['--udid', udid, '--fps', `${HELPER_FPS}`, '--bitrate', `${HELPER_BITRATE}`, '--max-size', `${HELPER_MAX_SIZE}`];
    return new HelperProcess(spawn(helperPath, args), logger);
  };
