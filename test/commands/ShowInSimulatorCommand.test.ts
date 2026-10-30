import { describe, expect, it, vi } from 'vitest';
import { CommandIds } from '../../src/commands/commandIds';
import { ShowInSimulatorCommand } from '../../src/commands/ShowInSimulatorCommand';

describe('ShowInSimulatorCommand', () => {
  it('shows the Simulator app', async () => {
    const window = { show: vi.fn(() => Promise.resolve()) };
    const errors = { present: vi.fn(() => Promise.resolve()) };
    const command = new ShowInSimulatorCommand(window, errors);
    expect(command.id).toBe(CommandIds.showInSimulator);
    await command.execute();
    expect(window.show).toHaveBeenCalledOnce();
    expect(errors.present).not.toHaveBeenCalled();
  });

  it('presents failures', async () => {
    const failure = new Error('no app');
    const errors = { present: vi.fn(() => Promise.resolve()) };
    await new ShowInSimulatorCommand({ show: () => Promise.reject(failure) }, errors).execute();
    expect(errors.present).toHaveBeenCalledWith(failure);
  });
});
