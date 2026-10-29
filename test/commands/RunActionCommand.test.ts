import { describe, expect, it, vi } from 'vitest';
import { RunActionCommand, actionCommandId } from '../../src/commands/RunActionCommand';

describe('RunActionCommand', () => {
  it('runs the action on the open mirror', async () => {
    const mirrors = { runAction: vi.fn(() => 'ran' as const) };
    const notify = vi.fn();
    const command = new RunActionCommand('screenshot', mirrors, notify);
    await command.execute();
    expect(command.id).toBe('reflect.action.screenshot');
    expect(actionCommandId('home')).toBe('reflect.action.home');
    expect(mirrors.runAction).toHaveBeenCalledWith('screenshot');
    expect(notify).not.toHaveBeenCalled();
  });

  it('asks to open a device when no mirror is open', async () => {
    const notify = vi.fn();
    await new RunActionCommand('home', { runAction: () => 'no-mirror' as const }, notify).execute();
    expect(notify).toHaveBeenCalledWith('Open a device first');
  });

  it('says so when the device does not support the action', async () => {
    const notify = vi.fn();
    await new RunActionCommand('reload', { runAction: () => 'unsupported' as const }, notify).execute();
    expect(notify).toHaveBeenCalledWith('Not available on this device');
  });
});
