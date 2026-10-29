import { describe, expect, it } from 'vitest';
import { DeviceSelectionService } from '../../src/adb/DeviceSelectionService';
import type { Device } from '../../src/devices/types';
import type { IDevicePicker } from '../../src/adb/types';
import { CompositeDeviceDiscovery } from '../../src/devices/CompositeDeviceDiscovery';
import { AdbNotFoundError, DeviceOfflineError, DeviceUnauthorizedError, NoDeviceError } from '../../src/core/errors';
import { device } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';

class FakePicker implements IDevicePicker {
  offered: readonly Device[] | undefined;

  constructor(private readonly choice: (devices: readonly Device[]) => Device | undefined) {}

  pick(devices: readonly Device[]): Promise<Device | undefined> {
    this.offered = devices;
    return Promise.resolve(this.choice(devices));
  }
}

const select = (devices: readonly Device[], choose = (list: readonly Device[]) => list[0]) => {
  const tracker = new FakeDeviceTracker(devices);
  const picker = new FakePicker(choose);
  return { tracker, picker, result: new DeviceSelectionService(tracker, picker).select() };
};

describe('DeviceSelectionService', () => {
  it('fails with NoDeviceError when nothing is connected', async () => {
    await expect(select([]).result).rejects.toBeInstanceOf(NoDeviceError);
  });

  it('offers the single ready device to the picker', async () => {
    const phone = device();
    const { result, picker, tracker } = select([phone]);
    expect(await result).toBe(phone);
    expect(picker.offered).toEqual([phone]);
    expect(tracker.started).toBe(1);
  });

  it('offers only ready devices when several are connected', async () => {
    const ready = [device({ id: 'A' }), device({ id: 'B' })];
    const { result, picker } = select([...ready, device({ id: 'C', state: 'unauthorized' })], (list) => list[1]);
    expect((await result)?.id).toBe('B');
    expect(picker.offered).toEqual(ready);
  });

  it('returns undefined when the user cancels', async () => {
    expect(await select([device(), device({ id: 'B' })], () => undefined).result).toBeUndefined();
  });

  it('explains unauthorized devices first', async () => {
    const devices = [device({ id: 'O', state: 'offline' }), device({ id: 'U', state: 'unauthorized' })];
    const error = await select(devices).result.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DeviceUnauthorizedError);
    expect((error as DeviceUnauthorizedError).serial).toBe('U');
  });

  it('explains offline devices', async () => {
    await expect(select([device({ state: 'offline' })]).result).rejects.toBeInstanceOf(DeviceOfflineError);
  });

  describe('discovery failures', () => {
    const build = (source: FakeDeviceTracker) => {
      const picker = new FakePicker((list) => list[0]);
      return { picker, service: new DeviceSelectionService(new CompositeDeviceDiscovery([source]), picker) };
    };

    it('surfaces the start failure when no device is ready', async () => {
      const source = new FakeDeviceTracker();
      const failure = new AdbNotFoundError(['/x']);
      source.startFailure = failure;
      await expect(build(source).service.select()).rejects.toBe(failure);
    });

    it('still picks a ready device when a start failure was recorded', async () => {
      const source = new FakeDeviceTracker([device()]);
      source.startFailure = new Error('boom');
      const { service, picker } = build(source);
      expect((await service.select())?.id).toBe('R5CX123');
      expect(picker.offered).toHaveLength(1);
    });

    it('does not leak failures into the next selection', async () => {
      const source = new FakeDeviceTracker();
      source.startFailure = new Error('boom');
      const { service } = build(source);
      await expect(service.select()).rejects.toThrow('boom');
      source.startFailure = undefined;
      await expect(service.select()).rejects.toBeInstanceOf(NoDeviceError);
    });

    it('stops recording after dispose', async () => {
      const source = new FakeDeviceTracker();
      source.startFailure = new Error('boom');
      const { service } = build(source);
      service.dispose();
      await expect(service.select()).rejects.toBeInstanceOf(NoDeviceError);
    });
  });
});
