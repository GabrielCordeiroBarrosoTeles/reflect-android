import { describe, expect, it } from 'vitest';
import { StatusBarAlignment } from 'vscode';
import { StatusBarPresenter } from '../../src/ui/StatusBarPresenter';
import { device } from '../fakes/devices';
import { FakeActiveDeviceContext } from '../fakes/FakeActiveDeviceContext';
import { window } from '../mocks/vscode';

const setup = (tracker = new FakeActiveDeviceContext()) => {
  const presenter = new StatusBarPresenter(tracker, 'reflect.openDevice');
  return { presenter, tracker, item: window.statusBarItems[0]! };
};

describe('StatusBarPresenter', () => {
  it('creates a visible item bound to the open command', () => {
    const { item } = setup();
    expect(item).toMatchObject({ id: 'reflect.device', alignment: StatusBarAlignment.Left, command: 'reflect.openDevice', visible: true });
    expect(item.name).toBe('Reflect');
  });

  it('shows when no device is connected', () => {
    const { item } = setup();
    expect(item.text).toBe('$(device-mobile) No device');
  });

  it('shows the single ready device and ignores unauthorized ones', () => {
    const { item, tracker } = setup();
    tracker.setDevices([device({ name: 'Pixel 8', model: 'Pixel 8' }), device({ id: 'X', state: 'unauthorized' })]);
    expect(item.text).toBe('$(device-mobile) Pixel 8');
    expect(item.tooltip).toBe('Reflect: click to open device');
  });

  it('counts several ready devices', () => {
    const { item, tracker } = setup();
    tracker.setDevices([device({ id: 'A' }), device({ id: 'B' })]);
    expect(item.text).toBe('$(device-mobile) 2 devices');
  });

  it('reflects the active device connection', () => {
    const phone = device({ name: 'Pixel 8', model: 'Pixel 8' });
    const { item, tracker } = setup(new FakeActiveDeviceContext([phone]));
    tracker.setMirroredDevice(phone);
    expect(item.text).toBe('$(device-mobile) Pixel 8');
    tracker.setDevices([]);
    expect(item.text).toBe('$(debug-disconnect) Pixel 8');
    expect(item.tooltip).toBe('Reflect: Pixel 8 disconnected');
    tracker.setMirroredDevice(undefined);
    expect(item.text).toBe('$(device-mobile) No device');
  });

  it('stops rendering and disposes the item', () => {
    const { item, tracker, presenter } = setup();
    presenter.dispose();
    tracker.setDevices([device()]);
    expect(item.disposed).toBe(true);
    expect(item.text).toBe('$(device-mobile) No device');
  });
});
