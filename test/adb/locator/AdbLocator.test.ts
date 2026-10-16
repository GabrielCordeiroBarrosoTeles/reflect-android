import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AdbLocator } from '../../../src/adb/locator/AdbLocator';
import { ADB_EXECUTABLE } from '../../../src/adb/locator/adbExecutable';
import { ConfigResolver } from '../../../src/adb/locator/ConfigResolver';
import { PathResolver } from '../../../src/adb/locator/PathResolver';
import { AdbNotFoundError } from '../../../src/core/errors';
import { createFakeAdb, createTempRoot } from './fs';

describe('AdbLocator', () => {
  it('returns the first executable found by the chain', async () => {
    const adb = await createFakeAdb(join(await createTempRoot(), 'bin'));
    const head = new ConfigResolver(() => '/missing/adb');
    head.setNext(new PathResolver({ PATH: join(adb, '..') }));
    expect(await new AdbLocator(head).locate()).toBe(adb);
  });

  it('reports every searched path when nothing is found', async () => {
    const head = new ConfigResolver(() => '/missing/adb');
    head.setNext(new PathResolver({ PATH: '/nowhere' }));
    const error = await new AdbLocator(head).locate().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(AdbNotFoundError);
    expect((error as AdbNotFoundError).searchedPaths).toEqual(['/missing/adb', join('/nowhere', ADB_EXECUTABLE)]);
  });
});
