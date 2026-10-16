import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileServerBinary } from '../../src/scrcpy/FileServerBinary';
import { createTempRoot } from '../adb/locator/fs';

describe('FileServerBinary', () => {
  it('streams the whole file and exposes its version', async () => {
    const path = join(await createTempRoot(), 'server.jar');
    await writeFile(path, Buffer.from([1, 2, 3]));
    const binary = new FileServerBinary(path, '3.3.3');
    const reader = (await binary.open()).getReader();
    const first = await reader.read();
    const end = await reader.read();
    expect(binary.version).toBe('3.3.3');
    expect(first.value).toEqual(new Uint8Array([1, 2, 3]));
    expect(end.done).toBe(true);
  });

  it('fails when the file is missing', async () => {
    await expect(new FileServerBinary('/missing/server.jar', '3.3.3').open()).rejects.toThrow();
  });
});
