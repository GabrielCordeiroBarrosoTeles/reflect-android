import type { ProcessRunner } from '../adb/types';

const QUARANTINE_ATTRIBUTE = 'com.apple.quarantine';
const ABSENT_ATTRIBUTE = 'No such xattr';

export const clearQuarantine = async (runner: ProcessRunner, path: string): Promise<void> => {
  try {
    await runner.run('xattr', ['-d', QUARANTINE_ATTRIBUTE, path]);
  } catch (error) {
    if (!(error instanceof Error && error.message.includes(ABSENT_ATTRIBUTE))) {
      throw error;
    }
  }
};
