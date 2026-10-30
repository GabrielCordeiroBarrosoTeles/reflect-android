import { describe, expect, it } from 'vitest';
import { HelperFrameParser } from '../../src/ios/HelperFrameParser';
import { HELLO, eventBytes, helloBytes, rawFrameBytes, videoConfigBytes, videoFrameBytes } from '../fakes/FakeHelperProcess';

describe('HelperFrameParser', () => {
  it('parses a hello frame', () => {
    expect(new HelperFrameParser().push(helloBytes())).toEqual([{ kind: 'hello', hello: HELLO }]);
  });

  it('parses a video-config frame', () => {
    const [frame] = new HelperFrameParser().push(videoConfigBytes(884, 1920, [0, 0, 0, 1, 0x67]));
    expect(frame).toEqual({ kind: 'video-config', width: 884, height: 1920, data: new Uint8Array([0, 0, 0, 1, 0x67]) });
  });

  it('parses a video-frame frame with keyframe flag and 64-bit pts', () => {
    const parser = new HelperFrameParser();
    const [key] = parser.push(videoFrameBytes(true, 5_000_000_000, [1, 2]));
    const [delta] = parser.push(videoFrameBytes(false, 7, [3]));
    expect(key).toEqual({ kind: 'video-frame', keyframe: true, pts: 5_000_000_000, data: new Uint8Array([1, 2]) });
    expect(delta).toEqual({ kind: 'video-frame', keyframe: false, pts: 7, data: new Uint8Array([3]) });
  });

  it('parses an event frame', () => {
    const [frame] = new HelperFrameParser().push(eventBytes({ type: 'warning', message: 'x' }));
    expect(frame).toEqual({ kind: 'event', event: { type: 'warning', message: 'x' } });
  });

  it('reassembles one frame split over three chunks', () => {
    const parser = new HelperFrameParser();
    const bytes = videoFrameBytes(true, 42, [9, 8, 7, 6]);
    expect(parser.push(bytes.slice(0, 3))).toEqual([]);
    expect(parser.push(bytes.slice(3, 10))).toEqual([]);
    expect(parser.push(bytes.slice(10))).toEqual([{ kind: 'video-frame', keyframe: true, pts: 42, data: new Uint8Array([9, 8, 7, 6]) }]);
  });

  it('parses two frames delivered in one chunk and keeps a trailing partial frame', () => {
    const parser = new HelperFrameParser();
    const second = videoFrameBytes(false, 2, [2]);
    const chunk = new Uint8Array([...videoFrameBytes(true, 1, [1]), ...second.slice(0, 4)]);
    expect(parser.push(chunk).map((frame) => frame.kind)).toEqual(['video-frame']);
    expect(parser.push(second.slice(4)).map((frame) => frame.kind)).toEqual(['video-frame']);
  });

  it('skips unknown frame types and malformed JSON', () => {
    const parser = new HelperFrameParser();
    const garbage = new TextEncoder().encode('{nope');
    const bytes = new Uint8Array([...rawFrameBytes(0x7f, new Uint8Array([1])), ...rawFrameBytes(0x01, garbage), ...rawFrameBytes(0x04, garbage)]);
    expect(parser.push(bytes)).toEqual([]);
    expect(parser.push(eventBytes({ type: 'warning' }))).toHaveLength(1);
  });
});
