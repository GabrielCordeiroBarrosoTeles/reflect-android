import { describe, expect, it, vi } from 'vitest';
import { ActiveDeviceContext } from '../../src/device/ActiveDeviceContext';
import { deviceInfo } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';

describe('ActiveDeviceContext', () => {
  it('targets the first ready device when nothing is mirrored', () => {
    const tracker = new FakeDeviceTracker([deviceInfo({ serial: 'U', state: 'unauthorized' }), deviceInfo({ serial: 'A' })]);
    const context = new ActiveDeviceContext(tracker);
    expect(context.devices).toBe(tracker.devices);
    expect(context.target?.serial).toBe('A');
  });

  it('targets the mirrored device while it is connected', () => {
    const tracker = new FakeDeviceTracker([deviceInfo({ serial: 'A' }), deviceInfo({ serial: 'B' })]);
    const context = new ActiveDeviceContext(tracker);
    context.setMirroredDevice(deviceInfo({ serial: 'B' }));
    expect(context.mirroredDevice?.serial).toBe('B');
    expect(context.target?.serial).toBe('B');
    tracker.setDevices([deviceInfo({ serial: 'A' })]);
    expect(context.target?.serial).toBe('A');
  });

  it('has no target without ready devices', () => {
    expect(new ActiveDeviceContext(new FakeDeviceTracker()).target).toBeUndefined();
  });

  it('notifies on device and mirror changes until disposed', () => {
    const tracker = new FakeDeviceTracker();
    const context = new ActiveDeviceContext(tracker);
    const listener = vi.fn();
    context.onDidChange(listener);
    tracker.setDevices([deviceInfo()]);
    context.setMirroredDevice(undefined);
    context.dispose();
    tracker.setDevices([]);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
