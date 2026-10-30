import { spawn } from 'node:child_process';
import { access, chmod, constants } from 'node:fs/promises';
import type { ChildProcessLike, SpawnFunction } from './types';

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
