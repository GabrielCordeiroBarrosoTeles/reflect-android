import { spawn } from 'node:child_process';
import { access, constants } from 'node:fs/promises';
import type { ChildProcessLike, SpawnFunction } from './types';

export const assertExecutable = (path: string): Promise<void> => access(path, constants.X_OK);

export const spawnHelper: SpawnFunction = (file, args): ChildProcessLike =>
  spawn(file, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
