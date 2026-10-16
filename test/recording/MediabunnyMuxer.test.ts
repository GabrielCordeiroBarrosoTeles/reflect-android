import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => [] as unknown[][]);

vi.mock('mediabunny', () => {
  class EncodedVideoPacketSource {
    constructor(readonly codec: string) {
      calls.push(['source', codec]);
    }
    add(packet: unknown, meta: unknown) {
      calls.push(['add', packet, meta]);
      return Promise.resolve();
    }
  }
  class Output {
    constructor(readonly options: unknown) {
      calls.push(['output', options]);
    }
    addVideoTrack(source: unknown) {
      calls.push(['track', source instanceof EncodedVideoPacketSource]);
    }
    start() {
      calls.push(['start']);
      return Promise.resolve();
    }
    finalize() {
      calls.push(['finalize']);
      return Promise.resolve();
    }
  }
  return {
    EncodedVideoPacketSource,
    Output,
    Mp4OutputFormat: class {
      constructor(readonly options: unknown) {}
    },
    FilePathTarget: class {
      constructor(readonly path: string) {}
    },
    EncodedPacket: class {
      constructor(
        readonly data: Uint8Array,
        readonly type: string,
        readonly timestamp: number,
        readonly duration: number,
      ) {}
    },
  };
});

const { MediabunnyMuxer } = await import('../../src/recording/MediabunnyMuxer');

describe('MediabunnyMuxer', () => {
  it('streams AVC packets to an MP4 file and finalizes it', async () => {
    const muxer = new MediabunnyMuxer('/out.mp4');
    await muxer.add({ data: new Uint8Array([1]), keyframe: true, timestamp: 0, duration: 0.1, decoderConfig: { codec: 'avc1.64002a', codedWidth: 2, codedHeight: 4 } });
    await muxer.add({ data: new Uint8Array([2]), keyframe: false, timestamp: 0.1, duration: 0.1 });
    await muxer.finalize();
    expect(calls[0]).toEqual(['source', 'avc']);
    expect(calls[1]?.[1]).toMatchObject({ format: { options: { fastStart: false } }, target: { path: '/out.mp4' } });
    expect(calls.slice(2, 4)).toEqual([['track', true], ['start']]);
    expect(calls[4]).toEqual(['add', expect.objectContaining({ type: 'key', timestamp: 0 }), { decoderConfig: { codec: 'avc1.64002a', codedWidth: 2, codedHeight: 4 } }]);
    expect(calls[5]).toEqual(['add', expect.objectContaining({ type: 'delta', timestamp: 0.1 }), undefined]);
    expect(calls[6]).toEqual(['finalize']);
  });
});
