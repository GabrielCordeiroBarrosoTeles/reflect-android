import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollerState } from '../../src/deviceInfo/DeviceInfoPoller';
import { DeviceInfoPoller } from '../../src/deviceInfo/DeviceInfoPoller';
import type { DeviceSnapshot, IDeviceInfoCollector } from '../../src/deviceInfo/types';

const snapshot = { foregroundPackage: 'app' } as DeviceSnapshot;

class FakeCollector implements IDeviceInfoCollector {
  readonly calls: string[] = [];
  failure: Error | undefined;

  collect(serial: string): Promise<DeviceSnapshot> {
    this.calls.push(serial);
    return this.failure ? Promise.reject(this.failure) : Promise.resolve(snapshot);
  }
}

const setup = () => {
  const collector = new FakeCollector();
  const poller = new DeviceInfoPoller(collector, 5000);
  const states: PollerState[] = [];
  poller.onDidChangeState((state) => states.push(state));
  return { collector, poller, states };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DeviceInfoPoller', () => {
  it('polls the target only while visible', async () => {
    const { collector, poller, states } = setup();
    poller.setTarget('A');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(collector.calls).toEqual([]);
    poller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual([{ kind: 'loaded', snapshot }]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(collector.calls).toEqual(['A', 'A', 'A']);
    poller.setVisible(false);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(collector.calls).toHaveLength(3);
  });

  it('reports failures and keeps polling', async () => {
    const { collector, poller, states } = setup();
    collector.failure = new Error('offline');
    poller.setTarget('A');
    poller.setVisible(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(states).toEqual([
      { kind: 'failed', error: collector.failure },
      { kind: 'failed', error: collector.failure },
    ]);
  });

  it('goes idle without a target and ignores repeated settings', async () => {
    const { collector, poller, states } = setup();
    poller.setVisible(true);
    poller.setVisible(true);
    poller.setTarget('A');
    poller.setTarget('A');
    await vi.advanceTimersByTimeAsync(0);
    poller.setTarget(undefined);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(collector.calls).toEqual(['A']);
    expect(states.at(-1)).toEqual({ kind: 'idle' });
  });

  it('drops results from a previous target', async () => {
    const { collector, poller, states } = setup();
    let resolve!: (value: DeviceSnapshot) => void;
    collector.collect = (serial) => {
      collector.calls.push(serial);
      return new Promise((done) => (resolve = done));
    };
    poller.setTarget('A');
    poller.setVisible(true);
    const first = resolve;
    poller.setTarget('B');
    first(snapshot);
    await vi.advanceTimersByTimeAsync(0);
    expect(states).toEqual([]);
    expect(collector.calls).toEqual(['A', 'B']);
  });

  it('refreshes immediately on demand', async () => {
    const { collector, poller } = setup();
    poller.setVisible(true);
    poller.setTarget('A');
    await vi.advanceTimersByTimeAsync(1000);
    poller.refresh();
    await vi.advanceTimersByTimeAsync(0);
    expect(collector.calls).toEqual(['A', 'A']);
  });

  it('stops on dispose', async () => {
    const { collector, poller, states } = setup();
    poller.setTarget('A');
    poller.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    poller.dispose();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(collector.calls).toEqual(['A']);
    expect(states).toHaveLength(1);
  });
});
