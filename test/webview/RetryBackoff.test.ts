// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RetryBackoff } from '../../src/webview/RetryBackoff';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RetryBackoff', () => {
  it('doubles the delay up to the maximum', () => {
    const backoff = new RetryBackoff(100, 300);
    const action = vi.fn();
    const delays: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const start = Date.now();
      backoff.schedule(() => {
        delays.push(Date.now() - start);
        action();
      });
      vi.runAllTimers();
    }
    expect(delays).toEqual([100, 200, 300, 300]);
  });

  it('ignores new schedules while one is pending', () => {
    const backoff = new RetryBackoff(100, 1000);
    const first = vi.fn();
    const second = vi.fn();
    backoff.schedule(first);
    backoff.schedule(second);
    vi.runAllTimers();
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
  });

  it('restarts from the base delay after reset', () => {
    const backoff = new RetryBackoff(100, 1000);
    backoff.schedule(() => undefined);
    vi.runAllTimers();
    backoff.reset();
    const action = vi.fn();
    backoff.schedule(action);
    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledOnce();
  });

  it('cancels a pending action', () => {
    const backoff = new RetryBackoff(100, 1000);
    const action = vi.fn();
    backoff.schedule(action);
    backoff.cancel();
    vi.runAllTimers();
    expect(action).not.toHaveBeenCalled();
  });
});
