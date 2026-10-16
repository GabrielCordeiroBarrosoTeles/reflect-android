import type { ScrcpyMediaStreamPacket, ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import type { WritableStreamDefaultWriter } from '@yume-chan/stream-extra';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
  WebGLVideoFrameRenderer,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import type { VideoConfig, VideoPacket } from '../shared/protocol';
import { PacketGate } from './PacketGate';
import { RetryBackoff } from './RetryBackoff';
import { toBytes } from './toBytes';
import type { VideoRendererListener } from './types';

interface ActiveDecoder {
  readonly codec: number;
  readonly decoder: WebCodecsVideoDecoder;
  readonly writer: WritableStreamDefaultWriter<ScrcpyMediaStreamPacket>;
}

export class VideoRenderer {
  private readonly gate = new PacketGate();
  private readonly backoff = new RetryBackoff(250, 4000);
  private lastFramesRendered = 0;
  private active: ActiveDecoder | undefined;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly acceleration: HardwareAcceleration,
    private readonly listener: VideoRendererListener,
  ) {}

  static get isSupported(): boolean {
    return WebCodecsVideoDecoder.isSupported;
  }

  get framesRendered(): number {
    return this.active?.decoder.framesRendered ?? 0;
  }

  configure(config: VideoConfig): void {
    if (config.width > 0 && config.height > 0) {
      this.canvas.style.aspectRatio = `${config.width} / ${config.height}`;
    }
    if (this.active?.codec === config.codec) {
      return;
    }
    this.createDecoder(config.codec);
  }

  render(packet: VideoPacket): void {
    const active = this.active;
    if (!active || !this.gate.admit(packet)) {
      return;
    }
    this.markHealthyIfRendering();
    active.writer.write(toScrcpyPacket(packet)).catch((error: unknown) => {
      if (active === this.active) {
        this.recover(active, error);
      }
    });
  }

  async snapshot(): Promise<Uint8Array | undefined> {
    const image = await this.active?.decoder.snapshot();
    return image ? new Uint8Array(await image.arrayBuffer()) : undefined;
  }

  dispose(): void {
    this.backoff.cancel();
    this.release();
    this.gate.reset();
  }

  private markHealthyIfRendering(): void {
    const rendered = this.framesRendered;
    if (rendered > this.lastFramesRendered) {
      this.lastFramesRendered = rendered;
      this.backoff.reset();
    }
  }

  private createDecoder(codec: number): void {
    this.dispose();
    this.lastFramesRendered = 0;
    const renderer = WebGLVideoFrameRenderer.isSupported
      ? new WebGLVideoFrameRenderer(this.canvas)
      : new BitmapVideoFrameRenderer(this.canvas);
    const decoder = new WebCodecsVideoDecoder({
      codec: codec as ScrcpyVideoCodecId,
      renderer,
      hardwareAcceleration: this.acceleration,
    });
    this.active = { codec, decoder, writer: decoder.writable.getWriter() };
  }

  private release(): void {
    this.active?.writer.releaseLock();
    this.active?.decoder.dispose();
    this.active = undefined;
  }

  private recover(active: ActiveDecoder, error: unknown): void {
    this.listener.onDecoderFailure(error);
    this.release();
    this.backoff.schedule(() => {
      this.createDecoder(active.codec);
      this.listener.onResyncNeeded();
    });
  }
}

const toScrcpyPacket = (packet: VideoPacket): ScrcpyMediaStreamPacket =>
  packet.kind === 'configuration'
    ? { type: 'configuration', data: toBytes(packet.data) }
    : {
        type: 'data',
        data: toBytes(packet.data),
        ...(packet.keyframe === undefined ? {} : { keyframe: packet.keyframe }),
        ...(packet.pts === undefined ? {} : { pts: BigInt(packet.pts) }),
      };
