import { describe, expect, it } from 'vitest';
import { clearQuarantine } from '../../src/ios/clearQuarantine';
import { FakeProcessRunner } from '../fakes/FakeProcessRunner';

describe('clearQuarantine', () => {
  it('removes the quarantine attribute', async () => {
    const runner = new FakeProcessRunner();
    await clearQuarantine(runner, '/h');
    expect(runner.calls).toEqual([{ executable: 'xattr', args: ['-d', 'com.apple.quarantine', '/h'] }]);
  });

  it('ignores a missing attribute', async () => {
    const runner = new FakeProcessRunner();
    runner.failure = new Error('Command failed\nxattr: No such xattr: com.apple.quarantine');
    await expect(clearQuarantine(runner, '/h')).resolves.toBeUndefined();
  });

  it('rethrows other failures', async () => {
    const runner = new FakeProcessRunner();
    runner.failure = new Error('Permission denied');
    await expect(clearQuarantine(runner, '/h')).rejects.toThrow('Permission denied');
    runner.failure = 'boom' as unknown as Error;
    await expect(clearQuarantine(runner, '/h')).rejects.toBe('boom');
  });
});
