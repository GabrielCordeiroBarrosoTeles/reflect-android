import { describe, expect, it, vi } from 'vitest';
import type { Device } from '../../src/devices/types';
import type { IDeviceSelectionService } from '../../src/adb/types';
import { CommandIds } from '../../src/commands/commandIds';
import { OpenDeviceCommand } from '../../src/commands/OpenDeviceCommand';
import type { MirrorManager } from '../../src/mirror/MirrorManager';
import type { ErrorPresenter } from '../../src/ui/ErrorPresenter';
import { device } from '../fakes/devices';

const setup = (select: () => Promise<Device | undefined>, location: () => 'editor' | 'secondarySidebar' = () => 'secondarySidebar') => {
  const selection: IDeviceSelectionService = { select };
  const mirrors = { open: vi.fn() };
  const activeDevice = { setMirroredDevice: vi.fn() };
  const errors = { present: vi.fn(() => Promise.resolve()) };
  const command = new OpenDeviceCommand(
    CommandIds.openDevice,
    location,
    selection,
    mirrors as unknown as MirrorManager,
    activeDevice as never,
    errors as unknown as ErrorPresenter,
  );
  return { command, mirrors, activeDevice, errors };
};

describe('OpenDeviceCommand', () => {
  it('uses the open device command id', () => {
    expect(setup(() => Promise.resolve(undefined)).command.id).toBe(CommandIds.openDevice);
  });

  it('opens the selected device at the configured location and marks it active', async () => {
    const phone = device();
    const { command, mirrors, activeDevice } = setup(() => Promise.resolve(phone), () => 'editor');
    await command.execute();
    expect(activeDevice.setMirroredDevice).toHaveBeenCalledWith(phone);
    expect(mirrors.open).toHaveBeenCalledWith(phone, 'editor');
  });

  it('does nothing when the selection is cancelled', async () => {
    const { command, mirrors } = setup(() => Promise.resolve(undefined));
    await command.execute();
    expect(mirrors.open).not.toHaveBeenCalled();
  });

  it('presents selection errors', async () => {
    const failure = new Error('no adb');
    const { command, errors } = setup(() => Promise.reject(failure));
    await command.execute();
    expect(errors.present).toHaveBeenCalledWith(failure);
  });
});
