import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, chmod, constants, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ChildProcessLike, SimctlFiles, SpawnFunction } from './types';

const EXECUTABLE_MODE = 0o755;

export const assertExecutable = async (path: string): Promise<void> => {
  try {
    await access(path, constants.X_OK);
  } catch (error) {
    await access(path, constants.F_OK).catch(() => {
      throw error;
    });
    await chmod(path, EXECUTABLE_MODE);
    await access(path, constants.X_OK);
  }
};

export const pathExists = (path: string): Promise<boolean> => access(path, constants.F_OK).then(
  () => true,
  () => false,
);

export const spawnHelper: SpawnFunction = (file, args): ChildProcessLike =>
  spawn(file, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });

export const simctlFiles: SimctlFiles = {
  tempPath: (name) => join(tmpdir(), `${name}-${randomUUID()}.png`),
  readFile: async (path) => new Uint8Array(await readFile(path)),
  rm: (path) => rm(path, { force: true }),
};
