import { mkdir } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADB_EXECUTABLE, platformToolsAdb } from '../../../src/adb/locator/adbExecutable';
import { AndroidHomeResolver } from '../../../src/adb/locator/AndroidHomeResolver';
import { ConfigResolver } from '../../../src/adb/locator/ConfigResolver';
import { DefaultSdkResolver } from '../../../src/adb/locator/DefaultSdkResolver';
import { PathResolver } from '../../../src/adb/locator/PathResolver';
import { createFakeAdb, createTempRoot } from './fs';

describe('ConfigResolver', () => {
  it('resolves the configured path when it is executable', async () => {
    const adb = await createFakeAdb(join(await createTempRoot(), 'custom'));
    expect(await new ConfigResolver(() => `  ${adb}  `).resolve([])).toBe(adb);
  });

  it.each([undefined, '', '   '])('contributes nothing when the setting is %j', async (value) => {
    const searched: string[] = [];
    expect(await new ConfigResolver(() => value).resolve(searched)).toBeUndefined();
    expect(searched).toEqual([]);
  });
});

describe('AndroidHomeResolver', () => {
  it('checks ANDROID_HOME before ANDROID_SDK_ROOT', async () => {
    const searched: string[] = [];
    await new AndroidHomeResolver({ ANDROID_HOME: '/home-sdk', ANDROID_SDK_ROOT: '/root-sdk' }).resolve(searched);
    expect(searched).toEqual([platformToolsAdb('/home-sdk'), platformToolsAdb('/root-sdk')]);
  });

  it('finds adb inside ANDROID_SDK_ROOT', async () => {
    const root = await createTempRoot();
    const adb = await createFakeAdb(join(root, 'platform-tools'));
    expect(await new AndroidHomeResolver({ ANDROID_SDK_ROOT: root }).resolve([])).toBe(adb);
  });

  it('contributes nothing without SDK variables', async () => {
    const searched: string[] = [];
    expect(await new AndroidHomeResolver({}).resolve(searched)).toBeUndefined();
    expect(searched).toEqual([]);
  });
});

describe('DefaultSdkResolver', () => {
  it.each([
    ['darwin', join('/Users/me', 'Library/Android/sdk')],
    ['linux', join('/Users/me', 'Android/Sdk')],
    ['win32', join('/Users/me', 'AppData/Local/Android/Sdk')],
  ] as const)('looks in the default SDK location on %s', async (platform, sdk) => {
    const searched: string[] = [];
    await new DefaultSdkResolver('/Users/me', platform).resolve(searched);
    expect(searched).toEqual([platformToolsAdb(sdk)]);
  });

  it('has no default location on other platforms', async () => {
    const searched: string[] = [];
    expect(await new DefaultSdkResolver('/Users/me', 'aix').resolve(searched)).toBeUndefined();
    expect(searched).toEqual([]);
  });

  it('finds adb in the default macOS SDK', async () => {
    const home = await createTempRoot();
    const adb = await createFakeAdb(join(home, 'Library/Android/sdk', 'platform-tools'));
    expect(await new DefaultSdkResolver(home, 'darwin').resolve([])).toBe(adb);
  });
});

describe('PathResolver', () => {
  it('walks PATH entries in order and skips empty ones', async () => {
    const root = await createTempRoot();
    const second = await createFakeAdb(join(root, 'second'));
    const path = ['', join(root, 'first'), join(root, 'second')].join(delimiter);
    const searched: string[] = [];
    expect(await new PathResolver({ PATH: path }).resolve(searched)).toBe(second);
    expect(searched).toEqual([join(root, 'first', ADB_EXECUTABLE), second]);
  });

  it('handles a missing PATH', async () => {
    expect(await new PathResolver({}).resolve([])).toBeUndefined();
  });
});

describe('AdbResolver', () => {
  it('ignores directories named like adb', async () => {
    const root = await createTempRoot();
    const directory = join(root, ADB_EXECUTABLE);
    await mkdir(directory);
    expect(await new ConfigResolver(() => directory).resolve([])).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')('ignores files without execute permission', async () => {
    const { chmod } = await import('node:fs/promises');
    const adb = await createFakeAdb(join(await createTempRoot(), 'bin'));
    await chmod(adb, 0o644);
    expect(await new ConfigResolver(() => adb).resolve([])).toBeUndefined();
  });

  it('delegates to the next resolver when nothing matches', async () => {
    const adb = await createFakeAdb(join(await createTempRoot(), 'bin'));
    const head = new ConfigResolver(() => '/missing/adb');
    const next = new ConfigResolver(() => adb);
    expect(head.setNext(next)).toBe(next);
    expect(await head.resolve([])).toBe(adb);
  });
});
