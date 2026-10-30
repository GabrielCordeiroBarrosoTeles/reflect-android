import { describe, expect, it, vi } from 'vitest';
import { SimctlRunner } from '../../src/ios/SimctlRunner';
import type { SimctlExecFile, SimctlFiles } from '../../src/ios/types';

const files = (overrides: Partial<SimctlFiles> = {}): SimctlFiles => ({
  tempPath: () => '/tmp/shot.png',
  readFile: () => Promise.resolve(new Uint8Array([137, 80])),
  rm: () => Promise.resolve(),
  ...overrides,
});

describe('SimctlRunner', () => {
  it('runs xcrun simctl with the args and timeout and resolves stdout', async () => {
    const execFile = vi.fn<SimctlExecFile>((_f, _a, _o, callback) => {
      callback(null, 'out');
      return { stdin: null };
    });
    await expect(new SimctlRunner(execFile, 15_000, files()).run(['list', 'devices', '-j'])).resolves.toBe('out');
    expect(execFile).toHaveBeenCalledWith('xcrun', ['simctl', 'list', 'devices', '-j'], { timeout: 15_000 }, expect.any(Function));
  });

  it('writes the input to stdin when given', async () => {
    const end = vi.fn();
    const execFile: SimctlExecFile = (_f, _a, _o, callback) => {
      callback(null, '');
      return { stdin: { end } };
    };
    await new SimctlRunner(execFile, 1, files()).run(['x'], 'payload');
    expect(end).toHaveBeenCalledWith('payload');
  });

  it('tolerates a missing stdin and rejects on process failure', async () => {
    const execFile: SimctlExecFile = (_f, _a, _o, callback) => {
      callback(new Error('xcrun: error'), '');
      return { stdin: null };
    };
    await expect(new SimctlRunner(execFile, 1, files()).run(['x'], 'payload')).rejects.toThrow('xcrun: error');
  });

  describe('screenshot', () => {
    const ok: SimctlExecFile = (_f, _a, _o, callback) => {
      callback(null, '');
      return { stdin: null };
    };

    it('captures to a temp file, returns its bytes and deletes it', async () => {
      const execFile = vi.fn<SimctlExecFile>(ok);
      const rm = vi.fn(() => Promise.resolve());
      await expect(new SimctlRunner(execFile, 1, files({ rm })).screenshot('U')).resolves.toEqual(new Uint8Array([137, 80]));
      expect(execFile).toHaveBeenCalledWith('xcrun', ['simctl', 'io', 'U', 'screenshot', '--type=png', '/tmp/shot.png'], { timeout: 1 }, expect.any(Function));
      expect(rm).toHaveBeenCalledWith('/tmp/shot.png');
    });

    it('rejects when simctl fails and still deletes the file', async () => {
      const failing: SimctlExecFile = (_f, _a, _o, callback) => {
        callback(new Error('boom'), '');
        return { stdin: null };
      };
      const rm = vi.fn(() => Promise.resolve());
      await expect(new SimctlRunner(failing, 1, files({ rm })).screenshot('U')).rejects.toThrow('boom');
      expect(rm).toHaveBeenCalledWith('/tmp/shot.png');
    });

    it('rejects when the file cannot be read, deletes it and ignores delete errors', async () => {
      const rm = vi.fn(() => Promise.reject(new Error('rm failed')));
      const readFile = () => Promise.reject(new Error('no file'));
      await expect(new SimctlRunner(ok, 1, files({ rm, readFile })).screenshot('U')).rejects.toThrow('no file');
      expect(rm).toHaveBeenCalledWith('/tmp/shot.png');
    });
  });
});
