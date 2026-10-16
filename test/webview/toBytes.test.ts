// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { toBytes } from '../../src/webview/toBytes';

describe('toBytes', () => {
  it('returns Uint8Array values as they are', () => {
    const bytes = new Uint8Array([1]);
    expect(toBytes(bytes)).toBe(bytes);
  });

  it('wraps ArrayBuffers', () => {
    expect(toBytes(new Uint8Array([2, 3]).buffer)).toEqual(new Uint8Array([2, 3]));
  });

  it('views other ArrayBuffer views without copying offsets wrong', () => {
    const buffer = new Uint8Array([0, 4, 5, 0]).buffer;
    expect(toBytes(new DataView(buffer, 1, 2))).toEqual(new Uint8Array([4, 5]));
  });

  it('rejects unsupported payloads', () => {
    expect(() => toBytes({ 0: 1 })).toThrow('Unsupported video payload: [object Object]');
  });
});
