import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HiddenTimeout } from '../../src/mirror/HiddenTimeout';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HiddenTimeout', () => {
  it('fires once after staying hidden for the delay', () => {
    const onTimeout = vi.fn();
    const timeout = new HiddenTimeout(1000, onTimeout);
    timeout.update(false);
    timeout.update(false);
    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('can fire again after a new hidden period', () => {
    const onTimeout = vi.fn();
    const timeout = new HiddenTimeout(1000, onTimeout);
    timeout.update(false);
    vi.advanceTimersByTime(1000);
    timeout.update(false);
    vi.advanceTimersByTime(1000);
    expect(onTimeout).toHaveBeenCalledTimes(2);
  });

  it('cancels when visible again or disposed', () => {
    const onTimeout = vi.fn();
    const timeout = new HiddenTimeout(1000, onTimeout);
    timeout.update(false);
    timeout.update(true);
    timeout.update(false);
    timeout.dispose();
    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
