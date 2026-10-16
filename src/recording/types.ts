import type { VideoPacket } from '../shared/protocol';

export interface MuxerSample {
  readonly data: Uint8Array;
  readonly keyframe: boolean;
  readonly timestamp: number;
  readonly duration: number;
  readonly decoderConfig?: { readonly codec: string; readonly codedWidth: number; readonly codedHeight: number };
}

export interface IMuxer {
  add(sample: MuxerSample): Promise<void>;
  finalize(): Promise<void>;
}

export type MuxerFactory = (path: string) => IMuxer;

export interface IRecorder {
  readonly path: string;
  push(packet: VideoPacket): void;
  stop(): Promise<boolean>;
}

export interface H264Info {
  readonly codec: string;
  readonly width: number;
  readonly height: number;
}

export type H264Parser = (configuration: Uint8Array) => H264Info;
