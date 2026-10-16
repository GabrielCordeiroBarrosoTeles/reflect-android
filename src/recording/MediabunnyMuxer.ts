import { EncodedPacket, EncodedVideoPacketSource, FilePathTarget, Mp4OutputFormat, Output } from 'mediabunny';
import type { IMuxer, MuxerSample } from './types';

export class MediabunnyMuxer implements IMuxer {
  private readonly source = new EncodedVideoPacketSource('avc');
  private readonly output: Output;
  private readonly started: Promise<void>;

  constructor(path: string) {
    this.output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new FilePathTarget(path) });
    this.output.addVideoTrack(this.source);
    this.started = this.output.start();
  }

  async add(sample: MuxerSample): Promise<void> {
    await this.started;
    const packet = new EncodedPacket(sample.data, sample.keyframe ? 'key' : 'delta', sample.timestamp, sample.duration);
    await this.source.add(packet, sample.decoderConfig ? { decoderConfig: sample.decoderConfig } : undefined);
  }

  async finalize(): Promise<void> {
    await this.started;
    await this.output.finalize();
  }
}
