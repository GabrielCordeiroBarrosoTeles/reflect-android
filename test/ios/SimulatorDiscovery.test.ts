import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulatorDiscovery } from '../../src/ios/SimulatorDiscovery';
import type { ISimctl } from '../../src/ios/types';
import { simctlDevicesJson } from './fixtures';

const TIMING = { intervalMs: 2000, failureBackoffMs: 30_000, maxFailureBackoffMs: 300_000 };

const setup = (run: ISimctl['run'], installed: () => Promise<boolean> = () => Promise.resolve(true)) => {
  const simctl: ISimctl = { run: vi.fn(run) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const simulatorsInstalled = vi.fn(installed);
  const discovery = new SimulatorDiscovery(simctl, logger, TIMING, simulatorsInstalled);
  const changes = vi.fn();
  discovery.onDidChangeDevices(changes);
  return { simctl, logger, discovery, changes, simulatorsInstalled };
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

  it('keeps the last known devices when a poll fails, so a hiccup does not drop a live mirror', async () => {
    let fail = false;
    const { discovery, changes } = setup(() => (fail ? Promise.reject(new Error('x')) : Promise.resolve(simctlDevicesJson())));
    await discovery.start();
    const known = discovery.devices;
    fail = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(discovery.devices).toBe(known);
    expect(known.length).toBeGreaterThan(0);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('stops polling on dispose and ignores late results', async () => {
    let resolveRun: (value: string) => void = () => undefined;
    const { discovery, simctl, changes } = setup(() => new Promise((resolve) => (resolveRun = resolve)));
    const started = discovery.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(simctl.run).toHaveBeenCalledTimes(1);
    discovery.dispose();
    resolveRun(simctlDevicesJson());
    await started;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(simctl.run).toHaveBeenCalledTimes(1);
    expect(changes).not.toHaveBeenCalled();
    await discovery.start();
    expect(simctl.run).toHaveBeenCalledTimes(1);
  });

  it('never runs simctl when CoreSimulator is not installed', async () => {
    const { discovery, simctl, logger, changes } = setup(() => Promise.resolve(simctlDevicesJson()), () => Promise.resolve(false));
    await discovery.start();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(simctl.run).not.toHaveBeenCalled();
    expect(changes).not.toHaveBeenCalled();
    expect(discovery.devices).toEqual([]);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not installed'));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not poll when disposed while checking for CoreSimulator', async () => {
    let answer: (installed: boolean) => void = () => undefined;
    const { discovery, simctl } = setup(
      () => Promise.resolve(simctlDevicesJson()),
      () => new Promise((resolve) => (answer = resolve)),
    );
    const started = discovery.start();
    discovery.dispose();
    answer(true);
    await started;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(simctl.run).not.toHaveBeenCalled();
  });

  it('backs off after failures, doubling from 30 s up to 5 min', async () => {
    const { discovery, simctl } = setup(() => Promise.reject(new Error('no xcode')));
    await discovery.start();
    const callsAfter = async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
      return vi.mocked(simctl.run).mock.calls.length;
    };
    expect(await callsAfter(29_999)).toBe(1);
    expect(await callsAfter(1)).toBe(2);
    expect(await callsAfter(59_999)).toBe(2);
    expect(await callsAfter(1)).toBe(3);
    expect(await callsAfter(120_000)).toBe(4);
    expect(await callsAfter(240_000)).toBe(5);
    expect(await callsAfter(299_999)).toBe(5);
    expect(await callsAfter(1)).toBe(6);
    expect(await callsAfter(300_000)).toBe(7);
    discovery.dispose();
  });

  it('returns to the normal interval once simctl recovers and logs a new outage again', async () => {
    let fail = true;
    const { discovery, simctl, logger } = setup(() => (fail ? Promise.reject(new Error('x')) : Promise.resolve(simctlDevicesJson())));
    await discovery.start();
    fail = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(discovery.devices).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(simctl.run).toHaveBeenCalledTimes(3);
    fail = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(logger.error).toHaveBeenCalledTimes(2);
    discovery.dispose();
  });
});
