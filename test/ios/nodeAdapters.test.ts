import { chmod, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertExecutable, pathExists, spawnHelper } from '../../src/ios/nodeAdapters';

describe('nodeAdapters', () => {
  it('accepts an executable file and restores the exec bit of a file that lost it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reflect-ios-'));
    const file = join(directory, 'helper');
    await writeFile(file, '#!/bin/sh\n');
    await chmod(file, 0o755);
    await expect(assertExecutable(file)).resolves.toBeUndefined();
    await chmod(file, 0o644);
    await expect(assertExecutable(file)).resolves.toBeUndefined();
    expect((await stat(file)).mode & 0o777).toBe(0o755);
  });

  it('rejects a missing helper with the original access error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reflect-ios-'));
    await expect(assertExecutable(join(directory, 'missing'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('tells whether a path exists', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reflect-ios-'));
    await expect(pathExists(directory)).resolves.toBe(true);
    await expect(pathExists(join(directory, 'missing'))).resolves.toBe(false);
  });

  it('spawns a process with piped stdio', async () => {
    const child = spawnHelper(process.execPath, ['-e', 'process.stdin.pipe(process.stdout)']);
    const output = new Promise<string>((resolve) => {
      child.stdout.on('data', (chunk) => resolve(Buffer.from(chunk).toString()));
    });
    child.stdin.write('ping');
    expect(await output).toBe('ping');
    child.kill();
  });
});
