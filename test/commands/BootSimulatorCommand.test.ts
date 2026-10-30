import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootSimulatorCommand } from '../../src/commands/BootSimulatorCommand';
import { CommandIds } from '../../src/commands/commandIds';
import type { Device } from '../../src/devices/types';
import { device } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';

const sim = (overrides: Partial<Device> = {}): Device =>
  device({ id: 'UDID-1', platform: 'ios', kind: 'simulator', name: 'iPhone 15', state: 'shutdown', ...overrides });

const setup = (devices: readonly Device[] = [sim()]) => {
  const discovery = new FakeDeviceTracker(devices);
  const simctl = { run: vi.fn(() => Promise.resolve('')) };
  const open = vi.fn(() => Promise.resolve());
  const errors = { present: vi.fn(() => Promise.resolve()) };
  const pick = vi.fn((candidates: readonly Device[]) => Promise.resolve(candidates[0]));
  const command = new BootSimulatorCommand(simctl, discovery, { pick }, open, errors, 60_000);
  return { command, discovery, simctl, open, errors, pick };
};

describe('BootSimulatorCommand', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('boots the simulator and opens it once discovery reports it ready', async () => {
    const { command, discovery, simctl, open } = setup();
    expect(command.id).toBe(CommandIds.bootSimulator);
    const done = command.execute('UDID-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(simctl.run).toHaveBeenCalledWith(['boot', 'UDID-1']);
    expect(open).not.toHaveBeenCalled();
    discovery.setDevices([sim({ state: 'ready' })]);
    await done;
    expect(open).toHaveBeenCalledWith('UDID-1');
  });

  it('does not miss a ready report that arrives while simctl boot is still running', async () => {
    const { command, discovery, simctl, open } = setup();
    let finishBoot = (): void => undefined;
    simctl.run.mockImplementation(() => new Promise<string>((resolve) => (finishBoot = () => resolve(''))));
    const done = command.execute('UDID-1');
    await vi.advanceTimersByTimeAsync(0);
    discovery.setDevices([sim({ state: 'ready' })]);
    finishBoot();
    await done;
    expect(open).toHaveBeenCalledWith('UDID-1');
  });

  it('ignores discovery changes for other devices', async () => {
    const { command, discovery, open } = setup();
    const done = command.execute('UDID-1');
    await vi.advanceTimersByTimeAsync(0);
    discovery.setDevices([sim({ id: 'OTHER', state: 'ready' }), sim()]);
    expect(open).not.toHaveBeenCalled();
    discovery.setDevices([sim({ state: 'ready' })]);
    await done;
    expect(open).toHaveBeenCalledWith('UDID-1');
  });

  it('opens directly when the simulator is already booted', async () => {
    const { command, simctl, open } = setup([sim({ state: 'ready' })]);
    await command.execute('UDID-1');
    expect(simctl.run).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('UDID-1');
  });

  it('reports a timeout when the simulator never finishes booting', async () => {
    const { command, errors, open } = setup();
    const done = command.execute('UDID-1');
    await vi.advanceTimersByTimeAsync(60_000);
    await done;
    expect(open).not.toHaveBeenCalled();
    expect(errors.present).toHaveBeenCalledWith(expect.objectContaining({ message: 'The simulator did not finish booting' }));
  });

  it('presents simctl failures', async () => {
    const { command, simctl, errors } = setup();
    const failure = new Error('boom');
    simctl.run.mockImplementation(() => Promise.reject(failure));
    await command.execute('UDID-1');
    expect(errors.present).toHaveBeenCalledWith(failure);
  });

  it('asks which shut-down simulator to boot when no id is given', async () => {
    const { command, discovery, pick, simctl, open } = setup([sim({ id: 'ON', state: 'ready' }), sim({ id: 'OFF' })]);
    const done = command.execute();
    await vi.advanceTimersByTimeAsync(0);
    expect(pick).toHaveBeenCalledWith([expect.objectContaining({ id: 'OFF' })]);
    expect(simctl.run).toHaveBeenCalledWith(['boot', 'OFF']);
    discovery.setDevices([sim({ id: 'OFF', state: 'ready' })]);
    await done;
    expect(open).toHaveBeenCalledWith('OFF');
  });

  it('does nothing when the pick is cancelled', async () => {
    const { command, pick, simctl } = setup();
    pick.mockImplementation(() => Promise.resolve(undefined));
    await command.execute();
    expect(simctl.run).not.toHaveBeenCalled();
  });

  it('explains when there is no shut-down simulator to boot', async () => {
    const { command, errors } = setup([sim({ state: 'ready' })]);
    await command.execute();
    expect(errors.present).toHaveBeenCalledWith(expect.objectContaining({ message: 'No shut-down simulator to boot' }));
  });
});
