import { describe, expect, it, vi } from 'vitest';
import { DisposableStore, toDisposable } from '../../src/core/Disposable';

describe('toDisposable', () => {
  it('wraps a callback as a disposable', () => {
    const callback = vi.fn();
    toDisposable(callback).dispose();
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe('DisposableStore', () => {
  it('disposes every item once', () => {
    const store = new DisposableStore();
    const first = vi.fn();
    const second = vi.fn();
    store.add(toDisposable(first));
    store.add(toDisposable(second));
    store.dispose();
    store.dispose();
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('keeps disposing the remaining items when one throws', () => {
    const store = new DisposableStore();
    const after = vi.fn();
    store.add(
      toDisposable(() => {
        throw new Error('boom');
      }),
    );
    store.add(toDisposable(after));
    expect(() => store.dispose()).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
  });

  it('disposes items added after the store was disposed immediately', () => {
    const store = new DisposableStore();
    store.dispose();
    const late = vi.fn();
    const item = toDisposable(late);
    expect(store.add(item)).toBe(item);
    expect(late).toHaveBeenCalledOnce();
  });
});
