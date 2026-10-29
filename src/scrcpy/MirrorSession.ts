import { AdbScrcpyExitedError } from '@yume-chan/adb-scrcpy';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { ReadableStream } from '@yume-chan/stream-extra';
import { WritableStream } from '@yume-chan/stream-extra';
import type { Device } from '../devices/types';
import { Emitter } from '../core/Emitter';
import type { DeviceLease, IDeviceLeasePool } from '../device/types';
import { MirrorStartError, isReflectError } from '../core/errors';
import type { ILogger } from '../core/types';
import type { SessionStateKind, VideoConfig, VideoPacket } from '../shared/protocol';
import { ControlChannel } from './ControlChannel';
import { SessionStateMachine } from './SessionStateMachine';
import { toVideoPacket } from './toVideoPacket';
import type { IDeviceControl, IMirrorSession, IScrcpyLauncher, IServerBinary, MirrorOptions, ScrcpyClientLike } from './types';

type ScrcpyClient = ScrcpyClientLike;

export class MirrorSession implements IMirrorSession {
  private readonly stateMachine = new SessionStateMachine();
  private readonly videoConfigEmitter = new Emitter<VideoConfig>();
  private readonly packetEmitter = new Emitter<VideoPacket>();
  private readonly clipboardEmitter = new Emitter<string>();
  private lease: DeviceLease | undefined;
  private client: ScrcpyClient | undefined;
  private currentVideoConfig: VideoConfig | undefined;
  private disposed = false;

  readonly onDidChangeState = this.stateMachine.onDidChange;
  readonly onDidChangeVideoConfig = this.videoConfigEmitter.event;
  readonly onVideoPacket = this.packetEmitter.event;
  readonly onDeviceClipboard = this.clipboardEmitter.event;
  readonly control: IDeviceControl = new ControlChannel(
    () => (this.stateMachine.state === 'streaming' ? this.client?.controller : undefined),
    () => this.currentVideoConfig,
  );

  constructor(
    private readonly device: Device,
    private readonly pool: IDeviceLeasePool,
    private readonly launcher: IScrcpyLauncher,
    private readonly serverBinary: IServerBinary,
    private readonly options: MirrorOptions,
    private readonly logger: ILogger,
  ) {}

  get state(): SessionStateKind {
    return this.stateMachine.state;
  }

  get videoConfig(): VideoConfig | undefined {
    return this.currentVideoConfig;
  }

  async start(): Promise<void> {
    if (!this.stateMachine.transitionTo('connecting')) {
      return;
    }
    try {
      const client = await this.launchServer();
      await this.attachVideo(client);
      this.watchExit(client);
      this.stateMachine.transitionTo('streaming');
    } catch (error) {
      await this.teardown();
      const failure = this.toStartError(error);
      this.stateMachine.transitionTo('error', failure.message);
      throw failure;
    }
  }

  async requestKeyframe(): Promise<void> {
    await this.client?.controller?.resetVideo();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stateMachine.transitionTo('closed');
    void this.teardown();
    this.stateMachine.dispose();
    this.videoConfigEmitter.dispose();
    this.packetEmitter.dispose();
    this.clipboardEmitter.dispose();
  }

  private async launchServer(): Promise<ScrcpyClient> {
    this.lease = await this.pool.acquire(this.device.id);
    const client = await this.launcher.launch(this.lease.adb, this.serverBinary, this.options);
    this.client = client;
    void this.drainOutput(client.output);
    void this.forwardClipboard(client.clipboard);
    return client;
  }

  private async attachVideo(client: ScrcpyClient): Promise<void> {
    const video = await client.videoStream;
    this.updateVideoConfig({
      codec: video.metadata.codec,
      width: video.metadata.width ?? 0,
      height: video.metadata.height ?? 0,
    });
    video.sizeChanged(({ width, height }) => this.updateVideoConfig({ codec: video.metadata.codec, width, height }));
    void this.pumpVideo(video.stream);
  }

  private updateVideoConfig(config: VideoConfig): void {
    this.currentVideoConfig = config;
    this.videoConfigEmitter.fire(config);
  }

  private async pumpVideo(stream: ReadableStream<ScrcpyMediaStreamPacket>): Promise<void> {
    try {
      await stream.pipeTo(
        new WritableStream<ScrcpyMediaStreamPacket>({
          write: (packet) => {
            if (!this.disposed) {
              this.packetEmitter.fire(toVideoPacket(packet));
            }
          },
        }),
      );
    } catch (error) {
      if (!this.disposed) {
        this.logger.error('Video stream interrupted', error);
      }
    }
  }

  private async drainOutput(output: ReadableStream<string>): Promise<void> {
    try {
      await output.pipeTo(
        new WritableStream<string>({
          write: (line) => this.logger.info(`[scrcpy] ${line}`),
        }),
      );
    } catch {
      return;
    }
  }

  private async forwardClipboard(clipboard: ReadableStream<string> | undefined): Promise<void> {
    if (!clipboard) {
      return;
    }
    try {
      await clipboard.pipeTo(
        new WritableStream<string>({
          write: (content) => {
            if (!this.disposed) {
              this.clipboardEmitter.fire(content);
            }
          },
        }),
      );
    } catch {
      return;
    }
  }

  private watchExit(client: ScrcpyClient): void {
    void client.exited.then(
      () => this.handleUnexpectedExit(),
      () => this.handleUnexpectedExit(),
    );
  }

  private handleUnexpectedExit(): void {
    if (this.disposed) {
      return;
    }
    this.logger.info(`scrcpy server on ${this.device.id} stopped`);
    void this.teardown();
    this.stateMachine.transitionTo('disconnected');
  }

  private async teardown(): Promise<void> {
    const client = this.client;
    const lease = this.lease;
    this.client = undefined;
    this.lease = undefined;
    await client?.close().catch((error: unknown) => this.logger.error('Failed to close scrcpy client', error));
    lease?.dispose();
  }

  private toStartError(error: unknown): Error {
    if (isReflectError(error)) {
      return error;
    }
    const details = error instanceof AdbScrcpyExitedError ? error.output : [];
    this.logger.error(`Failed to start mirroring on ${this.device.id}`, error);
    return new MirrorStartError(this.device.id, details, error);
  }
}
