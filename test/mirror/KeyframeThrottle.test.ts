import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyframeThrottle } from '../../src/mirror/KeyframeThrottle';

afterEach(() => {
  vi.useRealTimers();
});

describe('KeyframeThrottle', () => {
  it('allows one request per interval', () => {
    vi.useFakeTimers({ now: 10_000 });
    const throttle = new KeyframeThrottle(500);
    expect(throttle.tryAcquire()).toBe(true);
    expect(throttle.tryAcquire()).toBe(false);
    vi.advanceTimersByTime(499);
    expect(throttle.tryAcquire()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(throttle.tryAcquire()).toBe(true);
  });

  it('accepts a custom clock', () => {
    let now = 0;
    const throttle = new KeyframeThrottle(100, () => now);
    now = 100;
    expect(throttle.tryAcquire()).toBe(true);
    now = 150;
    expect(throttle.tryAcquire()).toBe(false);
  });
});
