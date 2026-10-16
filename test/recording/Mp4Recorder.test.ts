import { describe, expect, it, vi } from 'vitest';
import { Mp4Recorder } from '../../src/recording/Mp4Recorder';
import type { IMuxer, MuxerSample } from '../../src/recording/types';
import type { VideoPacket } from '../../src/shared/protocol';

class FakeMuxer implements IMuxer {
  readonly samples: MuxerSample[] = [];
  finalized = 0;
  add(sample: MuxerSample): Promise<void> {
    this.samples.push(sample);
    return Promise.resolve();
  }
  finalize(): Promise<void> {
    this.finalized += 1;
    return Promise.resolve();
  }
}

const config = (bytes: number[]): VideoPacket => ({ kind: 'configuration', data: new Uint8Array(bytes), keyframe: undefined, pts: undefined });
const frame = (byte: number, pts: number | undefined, keyframe: boolean | undefined): VideoPacket => ({ kind: 'data', data: new Uint8Array([byte]), keyframe, pts });

const setup = () => {
  const muxer = new FakeMuxer();
  const onFormatChange = vi.fn();
  const parse = vi.fn(() => ({ codec: 'avc1.64002a', width: 784, height: 1920 }));
  const createMuxer = vi.fn(() => muxer);
  return { muxer, onFormatChange, parse, createMuxer, recorder: new Mp4Recorder('/out.mp4', createMuxer, parse, onFormatChange) };
};

describe('Mp4Recorder', () => {
  it('starts on the first keyframe after a configuration, merging both', async () => {
    const { recorder, muxer, parse } = setup();
    recorder.push(frame(9, 0, true));
    recorder.push(config([1, 2]));
    recorder.push(frame(8, 100, false));
    recorder.push(frame(3, 1_000_000, true));
    recorder.push(frame(4, 1_033_333, false));
    expect(await recorder.stop()).toBe(true);
    expect(recorder.path).toBe('/out.mp4');
    expect(parse).toHaveBeenCalledWith(new Uint8Array([1, 2]));
    expect(muxer.samples).toEqual([
      { data: new Uint8Array([1, 2, 3]), keyframe: true, timestamp: 0, duration: 0.033333, decoderConfig: { codec: 'avc1.64002a', codedWidth: 784, codedHeight: 1920 } },
      { data: new Uint8Array([4]), keyframe: false, timestamp: 0.033333, duration: 1 / 60 },
    ]);
    expect(muxer.finalized).toBe(1);
  });

  it('treats packets without a keyframe flag as keyframes and missing pts as 60 fps', async () => {
    const { recorder, muxer } = setup();
    recorder.push(config([1]));
    recorder.push(frame(2, undefined, undefined));
    recorder.push(frame(3, undefined, false));
    await recorder.stop();
    expect(muxer.samples.map((sample) => sample.timestamp)).toEqual([0, 1 / 60]);
    expect(muxer.samples[0]?.duration).toBeCloseTo(1 / 60);
  });

  it('never goes back in time and uses a fallback duration for duplicate timestamps', async () => {
    const { recorder, muxer } = setup();
    recorder.push(config([1]));
    recorder.push(frame(2, 500, true));
    recorder.push(frame(3, 400, false));
    await recorder.stop();
    expect(muxer.samples.map((sample) => [sample.timestamp, sample.duration])).toEqual([
      [0, 1 / 60],
      [0, 1 / 60],
    ]);
  });

  it('ignores repeated identical configurations but stops on a new format', () => {
    const { recorder, onFormatChange } = setup();
    recorder.push(config([1]));
    recorder.push(frame(2, 0, true));
    recorder.push(config([1]));
    expect(onFormatChange).not.toHaveBeenCalled();
    recorder.push(config([1, 9]));
    recorder.push(config([7]));
    expect(onFormatChange).toHaveBeenCalledTimes(2);
  });

  it('updates the configuration freely before recording starts', async () => {
    const { recorder, muxer, onFormatChange } = setup();
    recorder.push(config([1]));
    recorder.push(config([5, 6]));
    recorder.push(frame(7, 0, true));
    await recorder.stop();
    expect(onFormatChange).not.toHaveBeenCalled();
    expect(muxer.samples[0]?.data).toEqual(new Uint8Array([5, 6, 7]));
  });

  it('creates no file for an empty recording', async () => {
    const { recorder, muxer, createMuxer } = setup();
    expect(await recorder.stop()).toBe(false);
    recorder.push(config([1]));
    recorder.push(frame(2, 0, true));
    expect(createMuxer).not.toHaveBeenCalled();
    expect(muxer.finalized).toBe(0);
  });

  it('stops only once', async () => {
    const { recorder, muxer, createMuxer } = setup();
    recorder.push(config([1]));
    recorder.push(frame(2, 0, true));
    expect(await recorder.stop()).toBe(true);
    expect(await recorder.stop()).toBe(false);
    expect(createMuxer).toHaveBeenCalledWith('/out.mp4');
    expect(muxer.finalized).toBe(1);
  });
});
