import type { HelperEvent, HelperFrame, HelperHello } from './types';

const HEADER_BYTES = 5;
const TYPE_HELLO = 0x01;
const TYPE_VIDEO_CONFIG = 0x02;
const TYPE_VIDEO_FRAME = 0x03;
const TYPE_EVENT = 0x04;
const CONFIG_HEADER_BYTES = 4;
const FRAME_HEADER_BYTES = 9;
const KEYFRAME_FLAG = 0x01;

const parseJson = <T>(payload: Uint8Array): T | undefined => {
  try {
    return JSON.parse(new TextDecoder().decode(payload)) as T;
  } catch {
    return undefined;
  }
};

export class HelperFrameParser {
  private pending: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): HelperFrame[] {
    this.pending = this.concat(this.pending, chunk);
    const frames: HelperFrame[] = [];
    while (this.pending.length >= HEADER_BYTES) {
      const view = new DataView(this.pending.buffer, this.pending.byteOffset, this.pending.byteLength);
      const end = HEADER_BYTES + view.getUint32(1);
      if (this.pending.length < end) {
        break;
      }
      const frame = this.decode(this.pending[0] as number, this.pending.slice(HEADER_BYTES, end));
      if (frame) {
        frames.push(frame);
      }
      this.pending = this.pending.slice(end);
    }
    return frames;
  }

  private decode(type: number, payload: Uint8Array): HelperFrame | undefined {
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    switch (type) {
      case TYPE_HELLO: {
        const hello = parseJson<HelperHello>(payload);
        return hello && { kind: 'hello', hello };
      }
      case TYPE_VIDEO_CONFIG:
        return {
          kind: 'video-config',
          width: view.getUint16(0),
          height: view.getUint16(2),
          data: payload.slice(CONFIG_HEADER_BYTES),
        };
      case TYPE_VIDEO_FRAME:
        return {
          kind: 'video-frame',
          keyframe: ((payload[0] as number) & KEYFRAME_FLAG) === KEYFRAME_FLAG,
          pts: Number(view.getBigUint64(1)),
          data: payload.slice(FRAME_HEADER_BYTES),
        };
      case TYPE_EVENT: {
        const event = parseJson<HelperEvent>(payload);
        return event && { kind: 'event', event };
      }
      default:
        return undefined;
    }
  }

  private concat(first: Uint8Array, second: Uint8Array): Uint8Array {
    const joined = new Uint8Array(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    return joined;
  }
}
