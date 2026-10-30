import { describe, expect, it } from 'vitest';
import { QuickPickDevicePicker } from '../../src/ui/QuickPickDevicePicker';
import { device } from '../fakes/devices';
import { window } from '../mocks/vscode';

describe('QuickPickDevicePicker', () => {
  it('returns the only device without asking', async () => {
    const phone = device();
    expect(await new QuickPickDevicePicker().pick([phone])).toBe(phone);
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it('asks the user when there are several devices', async () => {
    const devices = [device({ id: 'A', name: 'Pixel', model: 'Pixel' }), device({ id: 'B', name: 'B', model: undefined })];
    window.showQuickPick.mockImplementation((items) => Promise.resolve((items as unknown[])[1]));
    expect(await new QuickPickDevicePicker().pick(devices)).toBe(devices[1]);
    const [items, options] = window.showQuickPick.mock.calls[0]!;
    expect(items).toEqual([
      expect.objectContaining({ label: '$(device-mobile) Pixel', description: 'A', detail: 'b6qxeea' }),
      expect.objectContaining({ label: '$(device-mobile) B', description: 'B' }),
    ]);
    expect(options).toMatchObject({ title: 'Reflect: Select a device', placeHolder: 'Choose the device to mirror' });
  });

  it('labels emulators and iOS Simulators by kind', async () => {
    const devices = [
      device({ id: 'emulator-5554', name: 'Pixel_7', kind: 'emulator', detail: undefined }),
      device({ id: 'UDID-1', name: 'iPhone 15', platform: 'ios', kind: 'simulator', detail: 'iOS 26.0' }),
    ];
    await new QuickPickDevicePicker().pick(devices);
    const [items] = window.showQuickPick.mock.calls[0]!;
    expect(items).toEqual([
      expect.objectContaining({ label: '$(vm) Pixel_7', description: 'emulator-5554' }),
      expect.objectContaining({ label: '$(device-mobile) iPhone 15', description: 'iOS Simulator', detail: 'iOS 26.0' }),
    ]);
  });

  it('returns undefined when the user cancels', async () => {
    expect(await new QuickPickDevicePicker().pick([device({ id: 'A' }), device({ id: 'B' })])).toBeUndefined();
  });
});
