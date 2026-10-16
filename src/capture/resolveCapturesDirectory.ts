import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export const DEFAULT_CAPTURES_DIRECTORY = 'reflect-captures';

export const resolveCapturesDirectory = (setting: string | undefined, workspaceFolder: string | undefined): string => {
  const configured = setting?.trim() || DEFAULT_CAPTURES_DIRECTORY;
  if (isAbsolute(configured)) {
    return configured;
  }
  return workspaceFolder ? join(workspaceFolder, configured) : join(homedir(), 'Pictures', 'Reflect');
};
