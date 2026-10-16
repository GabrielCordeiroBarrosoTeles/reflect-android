import { describe, expect, it, vi } from 'vitest';
import { InspectCommand, OpenComponentSourceCommand, StopInspectingCommand } from '../../src/commands/InspectCommands';
import type { InspectController } from '../../src/inspector/InspectController';

const controller = () => ({ start: vi.fn(), cancel: vi.fn() }) as unknown as InspectController & { start: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };

describe('InspectCommand', () => {
  it('starts inspecting the open mirror', async () => {
    const target = controller();
    const openDevice = vi.fn();
    const command = new InspectCommand(target, () => true, openDevice);
    await command.execute();
    expect(command.id).toBe('reflect.inspect');
    expect(openDevice).not.toHaveBeenCalled();
    expect(target.start).toHaveBeenCalledOnce();
  });

  it('opens a device first and only inspects once a mirror exists', async () => {
    const target = controller();
    let open = false;
    await new InspectCommand(target, () => open, () => Promise.resolve((open = true))).execute();
    expect(target.start).toHaveBeenCalledOnce();
    const cancelled = controller();
    await new InspectCommand(cancelled, () => false, () => Promise.resolve()).execute();
    expect(cancelled.start).not.toHaveBeenCalled();
  });
});

describe('StopInspectingCommand', () => {
  it('cancels inspect mode', async () => {
    const target = controller();
    const command = new StopInspectingCommand(target);
    await command.execute();
    expect(command.id).toBe('reflect.stopInspecting');
    expect(target.cancel).toHaveBeenCalledOnce();
  });
});

describe('OpenComponentSourceCommand', () => {
  it('opens valid source locations only', async () => {
    const open = vi.fn(() => Promise.resolve());
    const command = new OpenComponentSourceCommand(open);
    await command.execute({ file: '/a.tsx', line: 3, column: 1 });
    await command.execute({ file: '/a.tsx' });
    await command.execute(null);
    await command.execute('x');
    expect(command.id).toBe('reflect.openComponentSource');
    expect(open).toHaveBeenCalledExactlyOnceWith({ file: '/a.tsx', line: 3, column: 1 });
  });
});
