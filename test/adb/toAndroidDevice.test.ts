import { describe, expect, it } from 'vitest';
import { toAndroidDevice } from '../../src/adb/toAndroidDevice';
import { deviceLabel, isReady } from '../../src/devices/types';
import { device, tangoDevice } from '../fakes/devices';

describe('toAndroidDevice', () => {
  it('maps a USB phone', () => {
    expect(toAndroidDevice(tangoDevice())).toEqual({
      id: 'R5CX123',
      platform: 'android',
      kind: 'physical',
      name: 'SM F741B',
      model: 'SM F741B',
      detail: 'b6qxeea',
      state: 'ready',
    });
  });

  it('humanizes the model name', () => {
    expect(toAndroidDevice(tangoDevice({ model: 'Pixel_8_Pro' })).model).toBe('Pixel 8 Pro');
  });

  it('marks emulator serials', () => {
    expect(toAndroidDevice(tangoDevice({ serial: 'emulator-5554' })).kind).toBe('emulator');
  });

  it('falls back to the serial as name', () => {
    const mapped = toAndroidDevice(tangoDevice({ model: undefined }));
    expect(mapped.name).toBe('R5CX123');
    expect(mapped.model).toBeUndefined();
  });

  it('maps adb states', () => {
    expect(toAndroidDevice(tangoDevice({ state: 'device' })).state).toBe('ready');
    expect(toAndroidDevice(tangoDevice({ state: 'unauthorized' })).state).toBe('unauthorized');
    expect(toAndroidDevice(tangoDevice({ state: 'offline' })).state).toBe('offline');
  });
});

describe('deviceLabel', () => {
  it('is the device name', () => {
    expect(deviceLabel(device({ name: 'Pixel 8' }))).toBe('Pixel 8');
  });
});

describe('isReady', () => {
  it('is true only for the ready state', () => {
    expect(isReady(device())).toBe(true);
    expect(isReady(device({ state: 'offline' }))).toBe(false);
    expect(isReady(device({ state: 'shutdown' }))).toBe(false);
  });
});
