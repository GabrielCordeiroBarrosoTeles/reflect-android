import { join } from 'node:path';

export const ADB_EXECUTABLE = process.platform === 'win32' ? 'adb.exe' : 'adb';

export const platformToolsAdb = (sdkRoot: string): string => join(sdkRoot, 'platform-tools', ADB_EXECUTABLE);
