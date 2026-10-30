import { describe, expect, it } from 'vitest';
import { HelperFrameParser, MAX_FRAME_BYTES } from '../../src/ios/HelperFrameParser';
import { HELLO, eventBytes, helloBytes, rawFrameBytes, videoConfigBytes, videoFrameBytes } from '../fakes/FakeHelperProcess';

const newParser = () => {
  const reports: string[] = [];
  return { parser: new HelperFrameParser((reason) => reports.push(reason)), reports };
};

describe('HelperFrameParser', () => {
  it('parses a hello frame', () => {
    expect(newParser().parser.push(helloBytes())).toEqual([{ kind: 'hello', hello: HELLO }]);
  });

  it('parses a video-config frame', () => {
    const [frame] = newParser().parser.push(videoConfigBytes(884, 1920, [0, 0, 0, 1, 0x67]));
    expect(frame).toEqual({ kind: 'video-config', width: 884, height: 1920, data: new Uint8Array([0, 0, 0, 1, 0x67]) });
  });

  it('parses a video-frame frame with keyframe flag and 64-bit pts', () => {
    const { parser } = newParser();
    const [key] = parser.push(videoFrameBytes(true, 5_000_000_000, [1, 2]));
    const [delta] = parser.push(videoFrameBytes(false, 7, [3]));
    expect(key).toEqual({ kind: 'video-frame', keyframe: true, pts: 5_000_000_000, data: new Uint8Array([1, 2]) });
    expect(delta).toEqual({ kind: 'video-frame', keyframe: false, pts: 7, data: new Uint8Array([3]) });
  });

  it('returns standalone Uint8Array payloads when stdout delivers pooled Node Buffers', () => {
    const { parser } = newParser();
    const pooled = (bytes: Uint8Array) => Buffer.concat([Buffer.alloc(3), Buffer.from(bytes)]).subarray(3);
    const [config] = parser.push(pooled(videoConfigBytes(884, 1920, [0, 0, 0, 1, 0x67])));
    const [frame] = parser.push(pooled(videoFrameBytes(true, 42, [9, 8, 7, 6])));
    for (const data of [(config as { data: Uint8Array }).data, (frame as { data: Uint8Array }).data]) {
      expect(Buffer.isBuffer(data)).toBe(false);
      expect(data.byteOffset).toBe(0);
      expect(data.buffer.byteLength).toBe(data.byteLength);
    }
    expect(JSON.stringify((frame as { data: Uint8Array }).data)).not.toContain('"type":"Buffer"');
  });

  it('parses an event frame', () => {
    const [frame] = newParser().parser.push(eventBytes({ type: 'warning', message: 'x' }));
    expect(frame).toEqual({ kind: 'event', event: { type: 'warning', message: 'x' } });
  });

  it('reassembles one frame split over three chunks', () => {
    const { parser } = newParser();
    const bytes = videoFrameBytes(true, 42, [9, 8, 7, 6]);
    expect(parser.push(bytes.slice(0, 3))).toEqual([]);
    expect(parser.push(bytes.slice(3, 10))).toEqual([]);
    expect(parser.push(bytes.slice(10))).toEqual([{ kind: 'video-frame', keyframe: true, pts: 42, data: new Uint8Array([9, 8, 7, 6]) }]);
  });

  it('parses two frames delivered in one chunk and keeps a trailing partial frame', () => {
    const { parser } = newParser();
    const second = videoFrameBytes(false, 2, [2]);
    const chunk = new Uint8Array([...videoFrameBytes(true, 1, [1]), ...second.slice(0, 4)]);
    expect(parser.push(chunk).map((frame) => frame.kind)).toEqual(['video-frame']);
    expect(parser.push(second.slice(4)).map((frame) => frame.kind)).toEqual(['video-frame']);
  });

  it('skips unknown frame types and malformed JSON', () => {
    const { parser } = newParser();
    const garbage = new TextEncoder().encode('{nope');
    const bytes = new Uint8Array([...rawFrameBytes(0x7f, new Uint8Array([1])), ...rawFrameBytes(0x01, garbage), ...rawFrameBytes(0x04, garbage)]);
    expect(parser.push(bytes)).toEqual([]);
    expect(parser.push(eventBytes({ type: 'warning' }))).toHaveLength(1);
  });

  it('reports and skips unknown types and malformed JSON', () => {
    const { parser, reports } = newParser();
    const garbage = new TextEncoder().encode('{nope');
    parser.push(new Uint8Array([...rawFrameBytes(0x7f, new Uint8Array([1])), ...rawFrameBytes(0x01, garbage), ...rawFrameBytes(0x04, garbage)]));
    expect(reports).toHaveLength(3);
  });

  it('skips short video-config and video-frame payloads, keeps parsing and never throws', () => {
    const { parser, reports } = newParser();
    const bytes = new Uint8Array([
      ...rawFrameBytes(0x02, new Uint8Array([0, 1, 2])),
      ...rawFrameBytes(0x03, new Uint8Array(8)),
      ...rawFrameBytes(0x03, new Uint8Array(0)),
      ...videoFrameBytes(true, 1, [1]),
    ]);
    expect(parser.push(bytes).map((frame) => frame.kind)).toEqual(['video-frame']);
    expect(reports).toHaveLength(3);
    expect(parser.push(videoFrameBytes(false, 2, [2]))).toHaveLength(1);
  });

  it('reports a zero-length event payload as malformed', () => {
    const { parser, reports } = newParser();
    expect(parser.push(rawFrameBytes(0x04, new Uint8Array(0)))).toEqual([]);
    expect(reports).toHaveLength(1);
  });

  it('flags a corrupt length, drops buffered data and ignores further input', () => {
    const { parser, reports } = newParser();
    const header = new Uint8Array(5);
    new DataView(header.buffer).setUint32(1, MAX_FRAME_BYTES + 1);
    header[0] = 0x03;
    expect(parser.push(videoFrameBytes(true, 1, [1]).slice(0, 0))).toEqual([]);
    expect(parser.corrupt).toBe(false);
    expect(parser.push(header)).toEqual([]);
    expect(parser.corrupt).toBe(true);
    expect(reports[0]).toContain('corrupt stream');
    expect(parser.push(videoFrameBytes(true, 1, [1]))).toEqual([]);
  });

  it('accepts a frame of exactly the maximum length', () => {
    const { parser } = newParser();
    const payload = new Uint8Array(MAX_FRAME_BYTES);
    const frames = parser.push(rawFrameBytes(0x7f, payload));
    expect(frames).toEqual([]);
    expect(parser.corrupt).toBe(false);
  });

  it('parses a frame split at every byte boundary, including inside the header', () => {
    const bytes = videoFrameBytes(true, 99, [1, 2, 3]);
    for (let cut = 1; cut < bytes.length; cut += 1) {
      const { parser } = newParser();
      expect(parser.push(bytes.slice(0, cut))).toEqual([]);
      expect(parser.push(bytes.slice(cut))).toEqual([{ kind: 'video-frame', keyframe: true, pts: 99, data: new Uint8Array([1, 2, 3]) }]);
    }
  });

  it('parses a byte-by-byte delivery of two frames', () => {
    const { parser } = newParser();
    const bytes = new Uint8Array([...eventBytes({ type: 'a' }), ...videoFrameBytes(false, 3, [7])]);
    const kinds = [...bytes].flatMap((byte) => parser.push(new Uint8Array([byte])).map((frame) => frame.kind));
    expect(kinds).toEqual(['event', 'video-frame']);
  });

  it('handles a large frame in many small chunks and many frames in one chunk', () => {
    const { parser } = newParser();
    const big = new Uint8Array(2_000_000).fill(7);
    const large = rawFrameBytes(0x03, new Uint8Array([1, 0, 0, 0, 0, 0, 0, 0, 5, ...big]));
    let frames = 0;
    for (let offset = 0; offset < large.length; offset += 1000) {
      frames += parser.push(large.subarray(offset, offset + 1000)).length;
    }
    expect(frames).toBe(1);
    const many = new Uint8Array(Array.from({ length: 500 }, (_, index) => [...videoFrameBytes(false, index, [index % 256])]).flat());
    const parsed = parser.push(many);
    expect(parsed).toHaveLength(500);
  });
});
