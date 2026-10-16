import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';
import { AutoReconnect } from '../../src/mirror/AutoReconnect';

const timing = { baseDelayMs: 100, maxDelayMs: 800, giveUpAfterMs: 5000 };

const setup = (reconnect: () => Promise<void> = () => Promise.resolve()) => {
  const changes = new Emitter<void>();
  let ready = false;
  const availability = { onDidChange: changes.event, isReady: vi.fn(() => ready) };
  const onGiveUp = vi.fn();
  const reconnectFn = vi.fn(reconnect);
  const auto = new AutoReconnect({ serial: 'A', availability, timing, reconnect: reconnectFn, onGiveUp, now: () => Date.now() });
  return {
    auto,
    changes,
    onGiveUp,
    reconnect: reconnectFn,
    availability,
    setReady: (value: boolean) => {
      ready = value;
      changes.fire();
    },
  };
};

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AutoReconnect', () => {
  it('reconnects as soon as the device is back', async () => {
    const { auto, setReady, reconnect, availability } = setup();
    auto.start();
    expect(availability.isReady).toHaveBeenCalledWith('A');
    expect(reconnect).not.toHaveBeenCalled();
    setReady(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(auto.active).toBe(false);
  });

  it('reconnects immediately when the device is already available', async () => {
    const { auto, setReady, reconnect } = setup();
    setReady(true);
    auto.start();
    auto.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('retries failed attempts with exponential backoff', async () => {
    let failures = 2;
    const { auto, setReady, reconnect } = setup(() => (failures-- > 0 ? Promise.reject(new Error('booting')) : Promise.resolve()));
    auto.start();
    setReady(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(reconnect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(reconnect).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(reconnect).toHaveBeenCalledTimes(3);
    expect(auto.active).toBe(false);
  });

  it('ignores device events while an attempt is running', async () => {
    let finish!: () => void;
    const { auto, setReady, reconnect } = setup(() => new Promise<void>((resolve) => (finish = resolve)));
    auto.start();
    setReady(true);
    setReady(true);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it('gives up after the deadline and can be started again', async () => {
    const { auto, onGiveUp, reconnect } = setup();
    auto.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onGiveUp).toHaveBeenCalledOnce();
    expect(auto.active).toBe(false);
    expect(reconnect).not.toHaveBeenCalled();
    auto.start();
    expect(auto.active).toBe(true);
  });

  it('stops listening and cancels pending retries', async () => {
    const { auto, setReady, reconnect, onGiveUp } = setup(() => Promise.reject(new Error('x')));
    auto.start();
    setReady(true);
    await vi.advanceTimersByTimeAsync(0);
    auto.dispose();
    setReady(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(reconnect).toHaveBeenCalledOnce();
    expect(onGiveUp).not.toHaveBeenCalled();
  });

  it('uses the real clock by default', () => {
    const changes = new Emitter<void>();
    const auto = new AutoReconnect({
      serial: 'A',
      availability: { onDidChange: changes.event, isReady: () => false },
      timing,
      reconnect: () => Promise.resolve(),
      onGiveUp: vi.fn(),
    });
    auto.start();
    expect(auto.active).toBe(true);
    auto.stop();
  });
});
