import { describe, expect, it } from 'vitest';
import { APP_VISIBILITY_SCRIPT, MacAppVisibility } from '../../src/emulator/MacAppVisibility';
import { FakeProcessRunner } from '../fakes/FakeProcessRunner';

describe('MacAppVisibility', () => {
  it('hides the app of the pid through the AppKit bridge of osascript', async () => {
    const runner = new FakeProcessRunner();
    await new MacAppVisibility(runner).hide(47899);
    expect(runner.calls).toEqual([{ executable: 'osascript', args: ['-l', 'JavaScript', '-e', APP_VISIBILITY_SCRIPT, 'hide', '47899'] }]);
  });

  it('unhides the app of the pid', async () => {
    const runner = new FakeProcessRunner();
    await new MacAppVisibility(runner).unhide(47899);
    expect(runner.calls[0]?.args.slice(-2)).toEqual(['unhide', '47899']);
  });

  it('uses NSRunningApplication and fails when no app has the pid', () => {
    expect(APP_VISIBILITY_SCRIPT).toContain('NSRunningApplication.runningApplicationWithProcessIdentifier');
    expect(APP_VISIBILITY_SCRIPT).toContain('throw new Error("No app with pid "');
  });

  it('rejects when osascript fails', async () => {
    const runner = new FakeProcessRunner();
    runner.failure = new Error('execution error: No app with pid 1');
    await expect(new MacAppVisibility(runner).hide(1)).rejects.toThrow('No app with pid 1');
  });
});
