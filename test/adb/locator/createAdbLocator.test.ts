import { delimiter, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAdbLocator } from '../../../src/adb/locator/createAdbLocator';
import { AdbNotFoundError } from '../../../src/core/errors';
import { createFakeAdb, createTempRoot } from './fs';

const isolateEnvironment = async () => {
  const home = await createTempRoot();
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.stubEnv('ANDROID_HOME', '');
  vi.stubEnv('ANDROID_SDK_ROOT', '');
  vi.stubEnv('PATH', '');
  return home;
};

describe('createAdbLocator', () => {
  it('prefers the configured path over every other source', async () => {
    const home = await isolateEnvironment();
    const configured = await createFakeAdb(join(home, 'custom'));
    const sdk = join(home, 'sdk');
    await createFakeAdb(join(sdk, 'platform-tools'));
    vi.stubEnv('ANDROID_HOME', sdk);
    expect(await createAdbLocator(() => configured).locate()).toBe(configured);
  });

  it('uses ANDROID_HOME before PATH', async () => {
    const home = await isolateEnvironment();
    const sdk = join(home, 'sdk');
    const sdkAdb = await createFakeAdb(join(sdk, 'platform-tools'));
    await createFakeAdb(join(home, 'bin'));
    vi.stubEnv('ANDROID_HOME', sdk);
    vi.stubEnv('PATH', join(home, 'bin'));
    expect(await createAdbLocator(() => undefined).locate()).toBe(sdkAdb);
  });

  it('falls back to PATH', async () => {
    const home = await isolateEnvironment();
    const pathAdb = await createFakeAdb(join(home, 'bin'));
    vi.stubEnv('PATH', ['/nowhere', join(home, 'bin')].join(delimiter));
    expect(await createAdbLocator(() => undefined).locate()).toBe(pathAdb);
  });

  it('fails with the list of searched locations', async () => {
    await isolateEnvironment();
    await expect(createAdbLocator(() => undefined).locate()).rejects.toBeInstanceOf(AdbNotFoundError);
  });
});
