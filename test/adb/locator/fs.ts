import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADB_EXECUTABLE } from '../../../src/adb/locator/adbExecutable';

export const createTempRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'reflect-'));

export const createFakeAdb = async (directory: string, name = ADB_EXECUTABLE): Promise<string> => {
  await mkdir(directory, { recursive: true });
  const path = join(directory, name);
  await writeFile(path, '');
  await chmod(path, 0o755);
  return path;
};
