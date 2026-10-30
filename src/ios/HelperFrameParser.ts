import type { HelperEvent, HelperFrame, HelperHello } from './types';

const HEADER_BYTES = 5;
const TYPE_HELLO = 0x01;
const TYPE_VIDEO_CONFIG = 0x02;
const TYPE_VIDEO_FRAME = 0x03;
const TYPE_EVENT = 0x04;
const CONFIG_HEADER_BYTES = 4;
const FRAME_HEADER_BYTES = 9;
const KEYFRAME_FLAG = 0x01;
export const MAX_FRAME_BYTES = 16 * 1024 * 1024;

export type MalformedReporter = (reason: string) => void;

export class HelperFrameParser {
  private chunks: Uint8Array[] = [];
  private buffered = 0;
  private corruptStream = false;

  constructor(private readonly reportMalformed: MalformedReporter) {}

  get corrupt(): boolean {
    return this.corruptStream;
  }

  push(chunk: Uint8Array): HelperFrame[] {
    if (this.corruptStream) {
      return [];
    }
    this.chunks.push(chunk);
    this.buffered += chunk.length;
    const frames: HelperFrame[] = [];
    while (this.buffered >= HEADER_BYTES) {
      const header = this.take(HEADER_BYTES, false);
      const length = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(1);
      if (length > MAX_FRAME_BYTES) {
        this.markCorrupt(`frame length ${length} exceeds ${MAX_FRAME_BYTES}`);
        break;
      }
      if (this.buffered < HEADER_BYTES + length) {
        break;
      }
      this.take(HEADER_BYTES, true);
      const frame = this.decode(header[0] as number, this.take(length, true));
      if (frame) {
        frames.push(frame);
      }
    }
    return frames;
  }

  private markCorrupt(reason: string): void {
    this.corruptStream = true;
    this.chunks = [];
    this.buffered = 0;
    this.reportMalformed(`corrupt stream: ${reason}`);
  }

  private take(count: number, consume: boolean): Uint8Array {
    if (count === 0) {
      return new Uint8Array(0);
    }
    const first = this.chunks[0] as Uint8Array;
    if (first.length >= count) {
      const view = first.subarray(0, count);
      if (consume) {
        this.consumeFirst(count);
      }
      return view;
    }
    const joined = new Uint8Array(count);
    let filled = 0;
    let index = 0;
    while (filled < count) {
      const part = (this.chunks[index] as Uint8Array).subarray(0, count - filled);
      joined.set(part, filled);
      filled += part.length;
      index += 1;
    }
    if (consume) {
      this.consumeJoined(count);
    }
    return joined;
  }

  private consumeFirst(count: number): void {
    const first = this.chunks[0] as Uint8Array;
    this.buffered -= count;
    if (first.length === count) {
      this.chunks.shift();
    } else {
      this.chunks[0] = first.subarray(count);
    }
  }

  private consumeJoined(count: number): void {
    let remaining = count;
    while (remaining > 0) {
      const first = this.chunks[0] as Uint8Array;
      const used = Math.min(first.length, remaining);
      this.consumeFirst(used);
      remaining -= used;
    }
  }

  private decode(type: number, payload: Uint8Array): HelperFrame | undefined {
    switch (type) {
      case TYPE_HELLO: {
        const hello = this.parseJson<HelperHello>(payload, 'hello');
        return hello && { kind: 'hello', hello };
      }
      case TYPE_VIDEO_CONFIG:
        return this.decodeConfig(payload);
      case TYPE_VIDEO_FRAME:
        return this.decodeVideoFrame(payload);
      case TYPE_EVENT: {
        const event = this.parseJson<HelperEvent>(payload, 'event');
        return event && { kind: 'event', event };
      }
      default:
        this.reportMalformed(`unknown frame type 0x${type.toString(16)}`);
        return undefined;
    }
  }

  private decodeConfig(payload: Uint8Array): HelperFrame | undefined {
    if (payload.length < CONFIG_HEADER_BYTES) {
      this.reportMalformed(`video-config payload too short (${payload.length} bytes)`);
      return undefined;
    }
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    return { kind: 'video-config', width: view.getUint16(0), height: view.getUint16(2), data: payload.slice(CONFIG_HEADER_BYTES) };
  }

  private decodeVideoFrame(payload: Uint8Array): HelperFrame | undefined {
    if (payload.length < FRAME_HEADER_BYTES) {
      this.reportMalformed(`video-frame payload too short (${payload.length} bytes)`);
      return undefined;
    }
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    return {
      kind: 'video-frame',
      keyframe: ((payload[0] as number) & KEYFRAME_FLAG) === KEYFRAME_FLAG,
      pts: Number(view.getBigUint64(1)),
      data: payload.slice(FRAME_HEADER_BYTES),
    };
  }

  private parseJson<T>(payload: Uint8Array, name: string): T | undefined {
    try {
      return JSON.parse(new TextDecoder().decode(payload)) as T;
    } catch {
      this.reportMalformed(`${name} payload is not valid JSON`);
      return undefined;
    }
  }
}
