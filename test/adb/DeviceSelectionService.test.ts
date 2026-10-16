import { describe, expect, it } from 'vitest';
import { DeviceSelectionService } from '../../src/adb/DeviceSelectionService';
import type { DeviceInfo, IDevicePicker } from '../../src/adb/types';
import { DeviceOfflineError, DeviceUnauthorizedError, NoDeviceError } from '../../src/core/errors';
import { deviceInfo } from '../fakes/devices';
import { FakeDeviceTracker } from '../fakes/FakeDeviceTracker';

class FakePicker implements IDevicePicker {
  offered: readonly DeviceInfo[] | undefined;

  constructor(private readonly choice: (devices: readonly DeviceInfo[]) => DeviceInfo | undefined) {}

  pick(devices: readonly DeviceInfo[]): Promise<DeviceInfo | undefined> {
    this.offered = devices;
    return Promise.resolve(this.choice(devices));
  }
}

const select = (devices: readonly DeviceInfo[], choose = (list: readonly DeviceInfo[]) => list[0]) => {
  const tracker = new FakeDeviceTracker(devices);
  const picker = new FakePicker(choose);
  return { tracker, picker, result: new DeviceSelectionService(tracker, picker).select() };
};

describe('DeviceSelectionService', () => {
  it('fails with NoDeviceError when nothing is connected', async () => {
    await expect(select([]).result).rejects.toBeInstanceOf(NoDeviceError);
  });

  it('offers the single ready device to the picker', async () => {
    const device = deviceInfo();
    const { result, picker, tracker } = select([device]);
    expect(await result).toBe(device);
    expect(picker.offered).toEqual([device]);
    expect(tracker.started).toBe(1);
  });

  it('offers only ready devices when several are connected', async () => {
    const ready = [deviceInfo({ serial: 'A' }), deviceInfo({ serial: 'B' })];
    const { result, picker } = select([...ready, deviceInfo({ serial: 'C', state: 'unauthorized' })], (list) => list[1]);
    expect((await result)?.serial).toBe('B');
    expect(picker.offered).toEqual(ready);
  });

  it('returns undefined when the user cancels', async () => {
    expect(await select([deviceInfo(), deviceInfo({ serial: 'B' })], () => undefined).result).toBeUndefined();
  });

  it('explains unauthorized devices first', async () => {
    const devices = [deviceInfo({ serial: 'O', state: 'offline' }), deviceInfo({ serial: 'U', state: 'unauthorized' })];
    const error = await select(devices).result.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(DeviceUnauthorizedError);
    expect((error as DeviceUnauthorizedError).serial).toBe('U');
  });

  it('explains offline devices', async () => {
    await expect(select([deviceInfo({ state: 'offline' })]).result).rejects.toBeInstanceOf(DeviceOfflineError);
  });
});
