import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';

describe('Emitter', () => {
  it('delivers values to every subscribed listener', () => {
    const emitter = new Emitter<number>();
    const first = vi.fn();
    const second = vi.fn();
    emitter.event(first);
    emitter.event(second);
    emitter.fire(7);
    expect(first).toHaveBeenCalledWith(7);
    expect(second).toHaveBeenCalledWith(7);
  });

  it('stops delivering after the subscription is disposed', () => {
    const emitter = new Emitter<string>();
    const listener = vi.fn();
    const subscription = emitter.event(listener);
    subscription.dispose();
    emitter.fire('ignored');
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops all listeners when the emitter is disposed', () => {
    const emitter = new Emitter<void>();
    const listener = vi.fn();
    emitter.event(listener);
    emitter.dispose();
    emitter.fire();
    expect(listener).not.toHaveBeenCalled();
  });

  it('tolerates listeners that unsubscribe while being notified', () => {
    const emitter = new Emitter<number>();
    const late = vi.fn();
    const subscription = emitter.event(() => subscription.dispose());
    emitter.event(late);
    emitter.fire(1);
    emitter.fire(2);
    expect(late).toHaveBeenCalledTimes(2);
  });
});
