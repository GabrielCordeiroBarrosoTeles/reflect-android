import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatorDiscovery } from '../../src/ios/SimulatorDiscovery';
import type { ISimctl } from '../../src/ios/types';
import { simctlDevicesJson } from './fixtures';

const setup = (run: ISimctl['run']) => {
  const simctl: ISimctl = { run: vi.fn(run) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const discovery = new SimulatorDiscovery(simctl, logger, 2000);
  const changes = vi.fn();
  discovery.onDidChangeDevices(changes);
  return { simctl, logger, discovery, changes };
};

describe('SimulatorDiscovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('lists devices on start and fires once for identical polls', async () => {
    const { discovery, changes, simctl } = setup(() => Promise.resolve(simctlDevicesJson()));
    await discovery.start();
    await vi.advanceTimersByTimeAsync(4000);
    expect(simctl.run).toHaveBeenCalledWith(['list', 'devices', '-j']);
    expect(simctl.run).toHaveBeenCalledTimes(3);
    expect(discovery.devices).toHaveLength(3);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('fires when a device changes state', async () => {
    let state: 'Booted' | 'Shutdown' = 'Booted';
    const { discovery, changes } = setup(() => Promise.resolve(simctlDevicesJson(state)));
    await discovery.start();
    state = 'Shutdown';
    await vi.advanceTimersByTimeAsync(2000);
    expect(changes).toHaveBeenCalledTimes(2);
    expect(discovery.devices[0]?.state).toBe('shutdown');
  });

  it('never overlaps polls and schedules the next one after the current settles', async () => {
    let resolveRun: (value: string) => void = () => undefined;
    const { discovery, simctl } = setup(() => new Promise((resolve) => (resolveRun = resolve)));
    void discovery.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(simctl.run).toHaveBeenCalledTimes(1);
    resolveRun(simctlDevicesJson());
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(simctl.run).toHaveBeenCalledTimes(2);
    discovery.dispose();
  });

  it('start is idempotent', async () => {
    const { discovery, simctl } = setup(() => Promise.resolve(simctlDevicesJson()));
    await discovery.start();
    await discovery.start();
    expect(simctl.run).toHaveBeenCalledTimes(1);
  });

  it('reports no devices and logs only the first failure, without failing start', async () => {
    const { discovery, logger, changes } = setup(() => Promise.reject(new Error('no xcode')));
    await expect(discovery.start()).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(2000);
    expect(discovery.devices).toEqual([]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(changes).not.toHaveBeenCalled();
  });

  it('clears devices when simctl starts failing after succeeding', async () => {
    let fail = false;
    const { discovery, changes } = setup(() => (fail ? Promise.reject(new Error('x')) : Promise.resolve(simctlDevicesJson())));
    await discovery.start();
    fail = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(discovery.devices).toEqual([]);
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('stops polling on dispose and ignores late results', async () => {
    let resolveRun: (value: string) => void = () => undefined;
    const { discovery, simctl, changes } = setup(() => new Promise((resolve) => (resolveRun = resolve)));
    const started = discovery.start();
    discovery.dispose();
    resolveRun(simctlDevicesJson());
    await started;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(simctl.run).toHaveBeenCalledTimes(1);
    expect(changes).not.toHaveBeenCalled();
    await discovery.start();
    expect(simctl.run).toHaveBeenCalledTimes(1);
  });
});
