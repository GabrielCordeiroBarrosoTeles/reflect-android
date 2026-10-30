import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';
import { DiscoveryAvailability } from '../../src/devices/DiscoveryAvailability';
import type { Device } from '../../src/devices/types';
import { device } from '../fakes/devices';

describe('DiscoveryAvailability', () => {
  const setup = () => {
    const emitter = new Emitter<readonly Device[]>();
    const source = { devices: [] as readonly Device[], onDidChangeDevices: emitter.event };
    return { emitter, source, availability: new DiscoveryAvailability(source) };
  };

  it('reports a device ready only when discovery lists it as ready', () => {
    const { source, availability } = setup();
    expect(availability.isReady('UDID-1')).toBe(false);
    source.devices = [{ ...device(), id: 'UDID-1', state: 'shutdown' }];
    expect(availability.isReady('UDID-1')).toBe(false);
    source.devices = [{ ...device(), id: 'UDID-1', state: 'ready' }];
    expect(availability.isReady('UDID-1')).toBe(true);
    expect(availability.isReady('OTHER')).toBe(false);
  });

  it('notifies on every discovery change until the subscription is disposed', () => {
    const { emitter, availability } = setup();
    const listener = vi.fn();
    const subscription = availability.onDidChange(listener);
    emitter.fire([]);
    subscription.dispose();
    emitter.fire([]);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith();
  });
});
