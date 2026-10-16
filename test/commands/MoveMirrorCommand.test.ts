import { describe, expect, it, vi } from 'vitest';
import { MoveMirrorCommand } from '../../src/commands/MoveMirrorCommand';

describe('MoveMirrorCommand', () => {
  it('moves the open mirror to the requested location', async () => {
    const mirrors = { move: vi.fn(() => true) };
    const openNew = vi.fn(() => Promise.resolve());
    const command = new MoveMirrorCommand('reflect.moveToEditor', 'editor', mirrors, openNew);
    await command.execute();
    expect(command.id).toBe('reflect.moveToEditor');
    expect(mirrors.move).toHaveBeenCalledWith('editor');
    expect(openNew).not.toHaveBeenCalled();
  });

  it('opens a device there when nothing is mirrored yet', async () => {
    const openNew = vi.fn(() => Promise.resolve());
    await new MoveMirrorCommand('reflect.moveToSidebar', 'secondarySidebar', { move: () => false }, openNew).execute();
    expect(openNew).toHaveBeenCalledOnce();
  });
});
