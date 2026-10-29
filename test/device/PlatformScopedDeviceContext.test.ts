import { describe, expect, it, vi } from 'vitest';
import { PlatformScopedDeviceContext } from '../../src/device/PlatformScopedDeviceContext';
import { device } from '../fakes/devices';
import { FakeActiveDeviceContext } from '../fakes/FakeActiveDeviceContext';

const android = device({ id: 'A' });
const ios = device({ id: 'I', platform: 'ios', kind: 'simulator' });

describe('PlatformScopedDeviceContext', () => {
  it('passes through targets of its own platform', () => {
    const inner = new FakeActiveDeviceContext([android]);
    inner.target = android;
    inner.mirroredDevice = android;
    const scoped = new PlatformScopedDeviceContext(inner, 'android');
    expect(scoped.target).toBe(android);
    expect(scoped.mirroredDevice).toBe(android);
  });

  it('hides targets of another platform', () => {
    const inner = new FakeActiveDeviceContext([ios]);
    inner.target = ios;
    inner.mirroredDevice = ios;
    const scoped = new PlatformScopedDeviceContext(inner, 'android');
    expect(scoped.target).toBeUndefined();
    expect(scoped.mirroredDevice).toBeUndefined();
  });

  it('has no target when the inner one is unset', () => {
    expect(new PlatformScopedDeviceContext(new FakeActiveDeviceContext(), 'android').target).toBeUndefined();
  });

  it('filters devices to the platform', () => {
    const scoped = new PlatformScopedDeviceContext(new FakeActiveDeviceContext([android, ios]), 'android');
    expect(scoped.devices).toEqual([android]);
  });

  it('forwards changes and mirrored device updates to the inner context', () => {
    const inner = new FakeActiveDeviceContext();
    const scoped = new PlatformScopedDeviceContext(inner, 'android');
    const listener = vi.fn();
    scoped.onDidChange(listener);
    scoped.setMirroredDevice(android);
    expect(inner.mirroredDevice).toBe(android);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
