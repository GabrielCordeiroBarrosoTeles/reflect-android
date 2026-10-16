// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createHarness } from './helpers';

describe('FrameScheduler', () => {
  it('runs only the latest task per key once per frame', () => {
    const { scheduler, runFrame } = createHarness();
    const first = vi.fn();
    const latest = vi.fn();
    const other = vi.fn();
    scheduler.schedule('move', first);
    scheduler.schedule('move', latest);
    scheduler.schedule('scroll', other);
    expect(requestAnimationFrame).toBeDefined();
    runFrame();
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledOnce();
    expect(other).toHaveBeenCalledOnce();
  });

  it('flushes a single key immediately', () => {
    const { scheduler, runFrame } = createHarness();
    const task = vi.fn();
    scheduler.schedule('move', task);
    scheduler.flushNow('move');
    scheduler.flushNow('missing');
    runFrame();
    expect(task).toHaveBeenCalledOnce();
  });

  it('cancels the pending frame on dispose', () => {
    const { scheduler, runFrame } = createHarness();
    const task = vi.fn();
    scheduler.dispose();
    scheduler.schedule('move', task);
    scheduler.dispose();
    runFrame();
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
    expect(task).not.toHaveBeenCalled();
  });
});
