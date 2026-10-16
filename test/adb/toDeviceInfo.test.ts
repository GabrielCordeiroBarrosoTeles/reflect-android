import { describe, expect, it } from 'vitest';
import { deviceLabel, toDeviceInfo } from '../../src/adb/toDeviceInfo';
import { deviceInfo, tangoDevice } from '../fakes/devices';

describe('toDeviceInfo', () => {
  it('maps the adb device and humanizes the model name', () => {
    expect(toDeviceInfo(tangoDevice({ model: 'Pixel_8_Pro' }))).toEqual({
      serial: 'R5CX123',
      state: 'device',
      model: 'Pixel 8 Pro',
      product: 'b6qxeea',
      transportId: 1n,
    });
  });

  it('keeps the model undefined when adb does not report one', () => {
    expect(toDeviceInfo(tangoDevice({ model: undefined })).model).toBeUndefined();
  });
});

describe('deviceLabel', () => {
  it('prefers the model and falls back to the serial', () => {
    expect(deviceLabel(deviceInfo({ model: 'Pixel 8' }))).toBe('Pixel 8');
    expect(deviceLabel(deviceInfo({ model: undefined, serial: 'ABC' }))).toBe('ABC');
  });
});
