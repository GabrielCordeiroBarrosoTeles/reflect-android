import type { VideoPacket } from '../shared/protocol';
import type { H264Parser, IMuxer, IRecorder, MuxerFactory, MuxerSample } from './types';

const MICROSECONDS = 1_000_000;
const FALLBACK_FRAME_SECONDS = 1 / 60;

interface PendingSample {
  readonly data: Uint8Array;
  readonly keyframe: boolean;
  readonly pts: number;
  readonly decoderConfig?: MuxerSample['decoderConfig'];
}

const concat = (first: Uint8Array, second: Uint8Array): Uint8Array => {
  const merged = new Uint8Array(first.length + second.length);
  merged.set(first, 0);
  merged.set(second, first.length);
  return merged;
};

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((value, index) => value === b[index]);

export class Mp4Recorder implements IRecorder {
  private configuration: Uint8Array | undefined;
  private basePts: number | undefined;
  private pending: PendingSample | undefined;
  private queue: Promise<void> = Promise.resolve();
  private stopped = false;
  private lastPts = 0;
  private muxer: IMuxer | undefined;

  constructor(
    readonly path: string,
    private readonly createMuxer: MuxerFactory,
    private readonly parse: H264Parser,
    private readonly onFormatChange: () => void,
  ) {}

  push(packet: VideoPacket): void {
    if (this.stopped) {
      return;
    }
    if (packet.kind === 'configuration') {
      this.handleConfiguration(packet.data);
      return;
    }
    if (this.basePts === undefined) {
      this.startWith(packet);
      return;
    }
    this.enqueue({ data: packet.data, keyframe: packet.keyframe === true, pts: this.ptsOf(packet) });
  }

  async stop(): Promise<boolean> {
    const muxer = this.muxer;
    if (this.stopped || !muxer) {
      this.stopped = true;
      await this.queue;
      return false;
    }
    this.stopped = true;
    const last = this.pending as PendingSample;
    this.pending = undefined;
    this.write(last, FALLBACK_FRAME_SECONDS);
    this.queue = this.queue.then(() => muxer.finalize());
    await this.queue;
    return true;
  }

  private handleConfiguration(data: Uint8Array): void {
    if (this.basePts !== undefined && this.configuration && !sameBytes(this.configuration, data)) {
      this.onFormatChange();
      return;
    }
    this.configuration = data;
  }

  private startWith(packet: VideoPacket): void {
    if (!this.configuration || packet.keyframe === false) {
      return;
    }
    const info = this.parse(this.configuration);
    this.muxer = this.createMuxer(this.path);
    this.basePts = packet.pts ?? 0;
    this.enqueue({
      data: concat(this.configuration, packet.data),
      keyframe: true,
      pts: 0,
      decoderConfig: { codec: info.codec, codedWidth: info.width, codedHeight: info.height },
    });
  }

  private ptsOf(packet: VideoPacket): number {
    const pts = packet.pts === undefined ? this.lastPts + FALLBACK_FRAME_SECONDS * MICROSECONDS : packet.pts - (this.basePts as number);
    return Math.max(pts, this.lastPts);
  }

  private enqueue(sample: PendingSample): void {
    const previous = this.pending;
    this.pending = sample;
    this.lastPts = sample.pts;
    if (previous) {
      const duration = (sample.pts - previous.pts) / MICROSECONDS;
      this.write(previous, duration > 0 ? duration : FALLBACK_FRAME_SECONDS);
    }
  }

  private write(sample: PendingSample, duration: number): void {
    const muxerSample: MuxerSample = {
      data: sample.data,
      keyframe: sample.keyframe,
      timestamp: sample.pts / MICROSECONDS,
      duration,
      ...(sample.decoderConfig ? { decoderConfig: sample.decoderConfig } : {}),
    };
    const muxer = this.muxer as IMuxer;
    this.queue = this.queue.then(() => muxer.add(muxerSample));
  }
}
