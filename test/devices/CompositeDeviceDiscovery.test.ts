import { describe, expect, it, vi } from 'vitest';
import { CompositeDeviceDiscovery } from '../../src/devices/CompositeDeviceDiscovery';
import { device } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';

describe('CompositeDeviceDiscovery', () => {
  it('concatenates devices in source order', () => {
    const a = new FakeDeviceTracker([device({ id: 'A' })]);
    const b = new FakeDeviceTracker([device({ id: 'B', platform: 'ios' })]);
    expect(new CompositeDeviceDiscovery([a, b]).devices.map((d) => d.id)).toEqual(['A', 'B']);
  });

  it('re-fires changes with the merged list', () => {
    const a = new FakeDeviceTracker();
    const b = new FakeDeviceTracker([device({ id: 'B' })]);
    const composite = new CompositeDeviceDiscovery([a, b]);
    const listener = vi.fn();
    composite.onDidChangeDevices(listener);
    a.setDevices([device({ id: 'A' })]);
    expect(listener.mock.calls[0]?.[0].map((d: { id: string }) => d.id)).toEqual(['A', 'B']);
  });

  it('starts every source and reports failures without blocking the others', async () => {
    const a = new FakeDeviceTracker();
    const b = new FakeDeviceTracker();
    a.startFailure = new Error('boom');
    const composite = new CompositeDeviceDiscovery([a, b]);
    const failures: Error[] = [];
    composite.onDidFail((error) => failures.push(error));
    await expect(composite.start()).resolves.toBeUndefined();
    expect(b.started).toBe(1);
    expect(failures.map((e) => e.message)).toEqual(['boom']);
  });

  it('wraps non-Error rejections', async () => {
    const source = new FakeDeviceTracker();
    source.startFailure = 'nope' as unknown as Error;
    const composite = new CompositeDeviceDiscovery([source]);
    const failures: Error[] = [];
    composite.onDidFail((error) => failures.push(error));
    await composite.start();
    expect(failures[0]?.message).toBe('nope');
  });

  it('forwards source failures', () => {
    const source = new FakeDeviceTracker();
    const composite = new CompositeDeviceDiscovery([source]);
    const listener = vi.fn();
    composite.onDidFail(listener);
    source.fail(new Error('x'));
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('disposes sources and stops forwarding', () => {
    const source = new FakeDeviceTracker();
    const composite = new CompositeDeviceDiscovery([source]);
    const listener = vi.fn();
    composite.onDidChangeDevices(listener);
    composite.dispose();
    source.setDevices([]);
    expect(source.disposed).toBe(1);
    expect(listener).not.toHaveBeenCalled();
  });
});
