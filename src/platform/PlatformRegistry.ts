import type { Device } from '../devices/types';
import type { IPlatform, PlatformCapabilities } from './types';

export class PlatformRegistry {
  constructor(private readonly platforms: readonly IPlatform[]) {}

  get(device: Device): IPlatform {
    const platform = this.platforms.find((candidate) => candidate.id === device.platform);
    if (!platform) {
      throw new Error(`No platform for ${device.platform}`);
    }
    return platform;
  }

  capabilities(device: Device): PlatformCapabilities {
    return this.get(device).capabilities(device);
  }
}
