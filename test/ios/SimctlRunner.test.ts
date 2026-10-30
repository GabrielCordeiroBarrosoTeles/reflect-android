import { describe, expect, it, vi } from 'vitest';
import { SimctlRunner } from '../../src/ios/SimctlRunner';
import type { SimctlExecFile } from '../../src/ios/types';

describe('SimctlRunner', () => {
  it('runs xcrun simctl with the args and timeout and resolves stdout', async () => {
    const execFile = vi.fn<SimctlExecFile>((_f, _a, _o, callback) => {
      callback(null, 'out');
      return { stdin: null };
    });
    await expect(new SimctlRunner(execFile, 15_000).run(['list', 'devices', '-j'])).resolves.toBe('out');
    expect(execFile).toHaveBeenCalledWith('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 15_000 }, expect.any(Function));
  });

  it('writes the input to stdin when given', async () => {
    const end = vi.fn();
    const execFile: SimctlExecFile = (_f, _a, _o, callback) => {
      callback(null, '');
      return { stdin: { end } };
    };
    await new SimctlRunner(execFile, 1).run(['x'], 'payload');
    expect(end).toHaveBeenCalledWith('payload');
  });

  it('tolerates a missing stdin and rejects on process failure', async () => {
    const execFile: SimctlExecFile = (_f, _a, _o, callback) => {
      callback(new Error('xcrun: error'), '');
      return { stdin: null };
    };
    await expect(new SimctlRunner(execFile, 1).run(['x'], 'payload')).rejects.toThrow('xcrun: error');
  });
});
