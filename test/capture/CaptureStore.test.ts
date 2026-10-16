import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CaptureStore } from '../../src/capture/CaptureStore';
import { createTempRoot } from '../adb/locator/fs';

const fixedDate = () => new Date(2026, 9, 16, 9, 5, 7);

describe('CaptureStore', () => {
  it('saves bytes with a readable, timestamped name', async () => {
    const root = await createTempRoot();
    const directory = join(root, 'captures', 'nested');
    const path = await new CaptureStore(() => directory, fixedDate).save(new Uint8Array([1, 2]), 'png', 'SM F741B');
    expect(path).toBe(join(directory, 'reflect-sm-f741b-20261016-090507.png'));
    expect([...(await readFile(path))]).toEqual([1, 2]);
  });

  it('reserves a path without writing and falls back to a generic label', async () => {
    const root = await createTempRoot();
    const path = await new CaptureStore(() => root, fixedDate).reserve('mp4', '!!!');
    expect(path).toBe(join(root, 'reflect-device-20261016-090507.mp4'));
    await expect(readFile(path)).rejects.toThrow();
  });

  it('uses the current time by default', async () => {
    const root = await createTempRoot();
    expect(await new CaptureStore(() => root).reserve('png', 'x')).toMatch(/reflect-x-\d{8}-\d{6}\.png$/);
  });
});
