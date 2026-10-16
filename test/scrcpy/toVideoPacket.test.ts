import { describe, expect, it } from 'vitest';
import { toVideoPacket } from '../../src/scrcpy/toVideoPacket';

describe('toVideoPacket', () => {
  it('detaches configuration data from the source buffer', () => {
    const pool = new Uint8Array([9, 9, 1, 2, 3]);
    const view = pool.subarray(2);
    const packet = toVideoPacket({ type: 'configuration', data: view });
    expect(packet).toEqual({ kind: 'configuration', data: new Uint8Array([1, 2, 3]), keyframe: undefined, pts: undefined });
    expect(packet.data.byteOffset).toBe(0);
    expect(packet.data.buffer).not.toBe(pool.buffer);
  });

  it('converts data packets with bigint pts to numbers', () => {
    const packet = toVideoPacket({ type: 'data', data: new Uint8Array([4]), keyframe: true, pts: 16_666n });
    expect(packet).toEqual({ kind: 'data', data: new Uint8Array([4]), keyframe: true, pts: 16_666 });
  });

  it('keeps pts undefined when the server does not send it', () => {
    expect(toVideoPacket({ type: 'data', data: new Uint8Array([5]) }).pts).toBeUndefined();
  });

  it('turns Node buffers into plain Uint8Array instances', () => {
    const packet = toVideoPacket({ type: 'data', data: Buffer.from([7, 8]) });
    expect(Object.getPrototypeOf(packet.data)).toBe(Uint8Array.prototype);
  });
});
