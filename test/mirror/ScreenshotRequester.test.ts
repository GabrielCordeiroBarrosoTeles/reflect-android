import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenshotRequester } from '../../src/mirror/ScreenshotRequester';
import { FakeChannel } from '../fakes/FakeSurface';

afterEach(() => {
  vi.useRealTimers();
});

describe('ScreenshotRequester', () => {
  it('asks the webview for a frame and resolves with the matching reply', async () => {
    const channel = new FakeChannel();
    const requester = new ScreenshotRequester(channel, 1000);
    const first = requester.request();
    const second = requester.request();
    requester.resolve(2, new Uint8Array([2]));
    requester.resolve(1, new Uint8Array([1]));
    requester.resolve(99, new Uint8Array([9]));
    expect(channel.posted).toEqual([
      { type: 'capture-screenshot', requestId: 1 },
      { type: 'capture-screenshot', requestId: 2 },
    ]);
    expect(await first).toEqual(new Uint8Array([1]));
    expect(await second).toEqual(new Uint8Array([2]));
  });

  it('gives up after the timeout and on dispose', async () => {
    vi.useFakeTimers();
    const requester = new ScreenshotRequester(new FakeChannel(), 1000);
    const timedOut = requester.request();
    vi.advanceTimersByTime(1000);
    const disposed = requester.request();
    requester.dispose();
    expect(await timedOut).toBeUndefined();
    expect(await disposed).toBeUndefined();
  });
});
