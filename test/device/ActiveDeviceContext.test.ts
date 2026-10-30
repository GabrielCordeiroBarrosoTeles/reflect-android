import { describe, expect, it, vi } from 'vitest';
import { ActiveDeviceContext } from '../../src/device/ActiveDeviceContext';
import { device } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';

describe('ActiveDeviceContext', () => {
  it('targets the first ready device when nothing is mirrored', () => {
    const tracker = new FakeDeviceTracker([device({ id: 'U', state: 'unauthorized' }), device({ id: 'A' })]);
    const context = new ActiveDeviceContext(tracker);
    expect(context.devices).toBe(tracker.devices);
    expect(context.target?.id).toBe('A');
  });

  it('targets the mirrored device while it is connected', () => {
    const tracker = new FakeDeviceTracker([device({ id: 'A' }), device({ id: 'B' })]);
    const context = new ActiveDeviceContext(tracker);
    context.setMirroredDevice(device({ id: 'B' }));
    expect(context.mirroredDevice?.id).toBe('B');
    expect(context.target?.id).toBe('B');
    tracker.setDevices([device({ id: 'A' })]);
    expect(context.target?.id).toBe('A');
  });

  it('has no target without ready devices', () => {
    expect(new ActiveDeviceContext(new FakeDeviceTracker()).target).toBeUndefined();
  });

  it('notifies on device and mirror changes until disposed', () => {
    const tracker = new FakeDeviceTracker();
    const context = new ActiveDeviceContext(tracker);
    const listener = vi.fn();
    context.onDidChange(listener);
    tracker.setDevices([device()]);
    context.setMirroredDevice(undefined);
    context.dispose();
    tracker.setDevices([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
