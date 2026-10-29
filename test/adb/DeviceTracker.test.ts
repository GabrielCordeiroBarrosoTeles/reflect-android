import { describe, expect, it, vi } from 'vitest';
import { DeviceTracker } from '../../src/adb/DeviceTracker';
import { tangoDevice } from '../fakes/devices';
import { FakeAdbServerGateway } from '../fakes/FakeAdbServerGateway';

const setup = () => {
  const gateway = new FakeAdbServerGateway();
  const tracker = new DeviceTracker(gateway);
  return { gateway, tracker, observer: gateway.client.observer };
};

describe('DeviceTracker', () => {
  it('starts with the current device list and tracks every state', async () => {
    const { tracker, observer, gateway } = setup();
    observer.current = [tangoDevice()];
    const listener = vi.fn();
    tracker.onDidChangeDevices(listener);
    await tracker.start();
    expect(gateway.client.trackOptions).toEqual([{ includeStates: ['device', 'unauthorized', 'offline'] }]);
    expect(tracker.devices.map((device) => device.id)).toEqual(['R5CX123']);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('reports devices connecting, changing state and disconnecting', async () => {
    const { tracker, observer } = setup();
    await tracker.start();
    const snapshots: string[][] = [];
    tracker.onDidChangeDevices((devices) => snapshots.push(devices.map((device) => `${device.id}:${device.state}`)));
    observer.emitList([tangoDevice({ state: 'unauthorized' })]);
    observer.emitList([tangoDevice({ state: 'device' })]);
    observer.emitList([]);
    expect(snapshots).toEqual([['R5CX123:unauthorized'], ['R5CX123:ready'], []]);
  });

  it('starts only once even when called concurrently', async () => {
    const { tracker, gateway } = setup();
    await Promise.all([tracker.start(), tracker.start()]);
    await tracker.start();
    expect(gateway.client.trackOptions).toHaveLength(1);
  });

  it('clears the list and reports failures from the observer', async () => {
    const { tracker, observer, gateway } = setup();
    observer.current = [tangoDevice()];
    await tracker.start();
    const failure = vi.fn();
    tracker.onDidFail(failure);
    const error = new Error('adb server died');
    observer.emitError(error);
    expect(tracker.devices).toEqual([]);
    expect(failure).toHaveBeenCalledWith(error);
    await tracker.start();
    expect(gateway.client.trackOptions).toHaveLength(2);
  });

  it('allows retrying after the gateway fails', async () => {
    const { tracker, gateway } = setup();
    gateway.failure = new Error('no adb');
    await expect(tracker.start()).rejects.toThrow('no adb');
    gateway.failure = undefined;
    await expect(tracker.start()).resolves.toBeUndefined();
  });

  it('stops the observer on dispose', async () => {
    const { tracker, observer } = setup();
    await tracker.start();
    const listener = vi.fn();
    tracker.onDidChangeDevices(listener);
    tracker.dispose();
    observer.emitList([tangoDevice()]);
    expect(observer.stopped).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('can be disposed before starting', () => {
    expect(() => setup().tracker.dispose()).not.toThrow();
  });
});
