import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertExecutable, spawnHelper } from '../../src/ios/nodeAdapters';

describe('nodeAdapters', () => {
  it('accepts an executable file and rejects a non-executable one', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reflect-ios-'));
    const file = join(directory, 'helper');
    await writeFile(file, '#!/bin/sh\n');
    await chmod(file, 0o644);
    await expect(assertExecutable(file)).rejects.toThrow();
    await chmod(file, 0o755);
    await expect(assertExecutable(file)).resolves.toBeUndefined();
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
