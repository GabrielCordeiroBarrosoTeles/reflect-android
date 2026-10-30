import { describe, expect, it, vi } from 'vitest';
import { SimulatorAppWindow } from '../../src/ios/SimulatorAppWindow';
import { FakeLogger } from '../fakes/FakeLogger';
import { FakeProcessRunner } from '../fakes/FakeProcessRunner';

const setup = (mode: unknown = undefined) => {
  const runner = new FakeProcessRunner();
  const logger = new FakeLogger();
  const window = new SimulatorAppWindow(() => mode, runner, logger);
  const send = vi.fn();
  const changes: boolean[] = [];
  window.onDidChangeHidden((hidden) => changes.push(hidden));
  return { window, runner, logger, send, changes };
};

describe('SimulatorAppWindow', () => {
  it('asks the helper to quit Simulator by default, keeping the simulator booted', async () => {
    const { window, send, runner, changes, logger } = setup();
    await window.makeRoom(send);
    expect(logger.infos).toEqual(['Simulator app window: quit']);
    expect(send).toHaveBeenCalledWith({ type: 'simulatorApp', action: 'quit' });
    expect(runner.calls).toEqual([]);
    expect(window.hidden).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('falls back to quit for unknown setting values', async () => {
    const { window, send } = setup('nonsense');
    await window.makeRoom(send);
    expect(send).toHaveBeenCalledWith({ type: 'simulatorApp', action: 'quit' });
  });

  it('asks the helper to hide Simulator when configured to', async () => {
    const { window, send, runner } = setup('hide');
    await window.makeRoom(send);
    expect(send).toHaveBeenCalledWith({ type: 'simulatorApp', action: 'hide' });
    expect(runner.calls).toEqual([]);
    expect(window.hidden).toBe(true);
  });

  it('leaves the window alone', async () => {
    const { window, send, runner } = setup('leave');
    await window.makeRoom(send);
    expect(send).not.toHaveBeenCalled();
    expect(runner.calls).toEqual([]);
    expect(window.hidden).toBe(false);
  });

  it('shows Simulator again with open -a', async () => {
    const { window, send, runner, changes } = setup();
    await window.makeRoom(send);
    await window.show();
    expect(runner.calls).toEqual([{ executable: 'open', args: ['-a', 'Simulator'] }]);
    expect(window.hidden).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('does not repeat unchanged hidden notifications and propagates show failures', async () => {
    const { window, send, runner, changes } = setup();
    await window.makeRoom(send);
    await window.makeRoom(send);
    expect(changes).toEqual([true]);
    runner.failure = new Error('no app');
    await expect(window.show()).rejects.toThrow('no app');
    expect(window.hidden).toBe(true);
  });

  it('stops notifying after dispose', async () => {
    const { window, send, changes } = setup();
    window.dispose();
    await window.makeRoom(send);
    expect(changes).toEqual([]);
  });
});
