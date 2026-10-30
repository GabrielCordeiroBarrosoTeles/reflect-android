import { describe, expect, it, vi } from 'vitest';
import { CommandIds } from '../../src/commands/commandIds';
import { ShowDeviceWindowCommand } from '../../src/commands/ShowDeviceWindowCommand';

const setup = (show = vi.fn((_deviceId: string) => Promise.resolve())) => {
  const errors = { present: vi.fn(() => Promise.resolve()) };
  return { command: new ShowDeviceWindowCommand({ show }, errors), show, errors };
};

describe('ShowDeviceWindowCommand', () => {
  it('shows the window of the given device', async () => {
    const { command, show, errors } = setup();
    expect(command.id).toBe(CommandIds.showDeviceWindow);
    await command.execute('emulator-5554');
    expect(show).toHaveBeenCalledWith('emulator-5554');
    expect(errors.present).not.toHaveBeenCalled();
  });

  it('does nothing without a device id', async () => {
    const { command, show } = setup();
    await command.execute();
    await command.execute(42);
    expect(show).not.toHaveBeenCalled();
  });

  it('presents failures', async () => {
    const failure = new Error('No app with pid 47899');
    const { command, errors } = setup(vi.fn(() => Promise.reject(failure)));
    await command.execute('emulator-5554');
    expect(errors.present).toHaveBeenCalledWith(failure);
  });
});
