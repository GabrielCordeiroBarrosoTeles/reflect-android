import { describe, expect, it, vi } from 'vitest';
import { CommandIds } from '../../src/commands/commandIds';
import { CopyValueCommand } from '../../src/commands/CopyValueCommand';
import { RefreshDeviceInfoCommand } from '../../src/commands/RefreshDeviceInfoCommand';
import { FakeClipboard } from '../fakes/FakeClipboard';

describe('CopyValueCommand', () => {
  it('copies string values and confirms', async () => {
    const clipboard = new FakeClipboard();
    const notify = vi.fn();
    const command = new CopyValueCommand(clipboard, notify);
    await command.execute('192.168.1.38');
    expect(command.id).toBe(CommandIds.copyValue);
    expect(clipboard.text).toBe('192.168.1.38');
    expect(notify).toHaveBeenCalledWith('Copied "192.168.1.38"');
  });

  it('ignores calls without a value', async () => {
    const clipboard = new FakeClipboard('kept');
    const notify = vi.fn();
    await new CopyValueCommand(clipboard, notify).execute();
    expect(clipboard.text).toBe('kept');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('RefreshDeviceInfoCommand', () => {
  it('refreshes the view', async () => {
    const view = { refresh: vi.fn() };
    const command = new RefreshDeviceInfoCommand(view);
    await command.execute();
    expect(command.id).toBe(CommandIds.refreshDeviceInfo);
    expect(view.refresh).toHaveBeenCalledOnce();
  });
});
