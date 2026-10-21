import { describe, expect, it, vi } from 'vitest';
import type { MetroTarget } from '../../src/inspector/types';
import { AppConnectionWatcher } from '../../src/storage/AppConnectionWatcher';
import { AsyncStorageReader } from '../../src/storage/AsyncStorageReader';
import { deviceInfo } from '../fakes/devices';
import { FakeActiveDeviceContext } from '../fakes/FakeActiveDeviceContext';
import { createStorageSandbox } from '../fakes/storageSandbox';
import { flushPromises } from '../fakes/PushStream';

const device = deviceInfo({ serial: 'A', model: 'SM F741B' });
const timing = { pollIntervalMs: 1, pollAttempts: 5 };

describe('AsyncStorageReader', () => {
  const reader = (sandbox: ReturnType<typeof createStorageSandbox>) => {
    const connectionFor = vi.fn(() => Promise.resolve({ backend: { evaluate: sandbox.evaluate } }));
    return { connectionFor, reader: new AsyncStorageReader({ connectionFor } as never, timing) };
  };

  it('reads and removes keys over the shared app connection', async () => {
    const sandbox = createStorageSandbox({ a: '1', b: '2' });
    const { reader: storage, connectionFor } = reader(sandbox);
    expect(await storage.readAll(device)).toEqual({ status: 'ok', entries: [{ key: 'a', value: '1' }, { key: 'b', value: '2' }] });
    expect(await storage.remove(device, 'a')).toEqual({ status: 'ok', entries: [{ key: 'b', value: '2' }] });
    expect(await storage.set(device, 'c', '3')).toEqual({ status: 'ok', entries: [{ key: 'b', value: '2' }, { key: 'c', value: '3' }] });
    expect(await storage.clear(device)).toEqual({ status: 'ok', entries: [] });
    expect(connectionFor).toHaveBeenCalledWith(device);
  });

  it('gives up when the app never answers', async () => {
    const storage = new AsyncStorageReader({ connectionFor: () => Promise.resolve({ backend: { evaluate: () => Promise.resolve('{"status":"pending"}') } }) } as never, timing);
    expect(await storage.readAll(device)).toEqual({ status: 'miss' });
  });
});

describe('AppConnectionWatcher', () => {
  const target: MetroTarget = { id: '1', title: 'app', deviceName: 'SM-F741B', webSocketDebuggerUrl: 'ws://x' };

  it('checks Metro only while a device is mirrored and flips the context key', async () => {
    vi.useFakeTimers();
    const metro = { listTargets: vi.fn(() => Promise.resolve([target])) };
    const context = new FakeActiveDeviceContext();
    const setContext = vi.fn();
    const changes: boolean[] = [];
    const watcher = new AppConnectionWatcher(metro, context, setContext, 1000);
    watcher.onDidChange((connected) => changes.push(connected));
    expect(metro.listTargets).not.toHaveBeenCalled();
    context.setMirroredDevice(device);
    await vi.advanceTimersByTimeAsync(0);
    expect(watcher.isConnected).toBe(true);
    metro.listTargets.mockRejectedValueOnce(new Error('down'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(watcher.isConnected).toBe(false);
    metro.listTargets.mockResolvedValue([{ ...target, deviceName: 'Pixel', title: 'x' }, { ...target, deviceName: 'Other', title: 'y' }]);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(changes).toEqual([true, false]);
    metro.listTargets.mockResolvedValue([target]);
    await vi.advanceTimersByTimeAsync(1000);
    context.setMirroredDevice(undefined);
    await vi.advanceTimersByTimeAsync(5000);
    const calls = metro.listTargets.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(metro.listTargets).toHaveBeenCalledTimes(calls);
    expect(setContext.mock.calls).toEqual([[false], [true], [false], [true], [false]]);
    watcher.dispose();
    vi.useRealTimers();
  });

  it('drops a check that finishes after the device changed', async () => {
    let resolve: (targets: MetroTarget[]) => void = () => undefined;
    const metro = { listTargets: vi.fn().mockReturnValueOnce(new Promise<MetroTarget[]>((done) => (resolve = done))).mockResolvedValue([]) };
    const context = new FakeActiveDeviceContext();
    context.mirroredDevice = device;
    const setContext = vi.fn();
    const watcher = new AppConnectionWatcher(metro, context, setContext, 60_000);
    context.setMirroredDevice(undefined);
    resolve([target]);
    await flushPromises();
    expect(setContext.mock.calls).toEqual([[false]]);
    watcher.dispose();
  });
});
