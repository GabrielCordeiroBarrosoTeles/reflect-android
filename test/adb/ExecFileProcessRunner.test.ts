import { describe, expect, it, vi } from 'vitest';
import { ExecFileProcessRunner } from '../../src/adb/ExecFileProcessRunner';

describe('ExecFileProcessRunner', () => {
  it('runs the executable with a copy of the args and the timeout', async () => {
    const execFile = vi.fn(() => Promise.resolve({ stdout: '', stderr: '' }));
    const args = ['start-server'] as const;
    await new ExecFileProcessRunner(execFile, 1234).run('/sdk/adb', args);
    expect(execFile).toHaveBeenCalledWith('/sdk/adb', ['start-server'], { timeout: 1234 });
  });

  it('propagates process failures', async () => {
    const execFile = vi.fn(() => Promise.reject(new Error('ENOENT')));
    await expect(new ExecFileProcessRunner(execFile, 1).run('adb', [])).rejects.toThrow('ENOENT');
  });
});
