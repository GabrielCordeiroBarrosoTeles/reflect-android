import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalPlatform = process.platform;

const loadWithPlatform = async (platform: NodeJS.Platform) => {
  Object.defineProperty(process, 'platform', { value: platform });
  vi.resetModules();
  return import('../../../src/adb/locator/adbExecutable');
};

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform });
  vi.resetModules();
});

describe('adbExecutable', () => {
  it('uses adb.exe on Windows', async () => {
    const module = await loadWithPlatform('win32');
    expect(module.ADB_EXECUTABLE).toBe('adb.exe');
  });

  it.each(['darwin', 'linux'] as const)('uses adb on %s', async (platform) => {
    const module = await loadWithPlatform(platform);
    expect(module.ADB_EXECUTABLE).toBe('adb');
  });

  it('points to the platform-tools folder of an SDK', async () => {
    const module = await loadWithPlatform('darwin');
    expect(module.platformToolsAdb('/sdk')).toBe(join('/sdk', 'platform-tools', 'adb'));
  });
});
