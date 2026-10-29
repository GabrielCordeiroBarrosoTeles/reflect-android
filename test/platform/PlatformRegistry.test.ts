import { describe, expect, it } from 'vitest';
import { PlatformRegistry } from '../../src/platform/PlatformRegistry';
import type { IPlatform } from '../../src/platform/types';
import { device } from '../fakes/devices';

const platform = (id: IPlatform['id']): IPlatform => ({
  id,
  capabilities: () => ({ actions: ['reload'], tools: ['logs'] }),
  createMirrorSession: () => {
    throw new Error('unused');
  },
});

describe('PlatformRegistry', () => {
  it('returns the platform matching the device', () => {
    const android = platform('android');
    const registry = new PlatformRegistry([android, platform('ios')]);
    expect(registry.get(device())).toBe(android);
  });

  it('throws for an unregistered platform', () => {
    const registry = new PlatformRegistry([platform('android')]);
    expect(() => registry.get(device({ platform: 'ios' }))).toThrow('No platform for ios');
  });

  it('delegates capabilities to the platform', () => {
    const registry = new PlatformRegistry([platform('android')]);
    expect(registry.capabilities(device())).toEqual({ actions: ['reload'], tools: ['logs'] });
  });
});
