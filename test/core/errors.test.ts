import { describe, expect, it } from 'vitest';
import {
  AdbNotFoundError,
  AdbServerUnavailableError,
  DeviceOfflineError,
  DeviceUnauthorizedError,
  MetroUnavailableError,
  MirrorStartError,
  NoDeviceError,
  ReactNativeAppNotFoundError,
  isReflectError,
} from '../../src/core/errors';

describe('domain errors', () => {
  it.each([
    [new AdbNotFoundError(['/a']), 'adb-not-found', 'AdbNotFoundError'],
    [new AdbServerUnavailableError(), 'adb-server-unavailable', 'AdbServerUnavailableError'],
    [new NoDeviceError(), 'no-device', 'NoDeviceError'],
    [new DeviceUnauthorizedError('S1'), 'device-unauthorized', 'DeviceUnauthorizedError'],
    [new DeviceOfflineError('S1'), 'device-offline', 'DeviceOfflineError'],
    [new MirrorStartError('S1', []), 'mirror-failed', 'MirrorStartError'],
    [new MetroUnavailableError(8081), 'metro-unavailable', 'MetroUnavailableError'],
    [new ReactNativeAppNotFoundError('Pixel'), 'react-native-app-not-found', 'ReactNativeAppNotFoundError'],
  ])('%s exposes its code and name', (error, code, name) => {
    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
    expect(error).toBeInstanceOf(Error);
  });

  it('keeps the context needed to explain the failure', () => {
    const cause = new Error('socket closed');
    expect(new AdbNotFoundError(['/a', '/b']).searchedPaths).toEqual(['/a', '/b']);
    expect(new AdbServerUnavailableError(cause).cause).toBe(cause);
    expect(new DeviceUnauthorizedError('S1').message).toContain('S1');
    expect(new DeviceOfflineError('S2').serial).toBe('S2');
    const mirror = new MirrorStartError('S3', ['line'], cause);
    expect(mirror.details).toEqual(['line']);
    expect(mirror.cause).toBe(cause);
    expect(mirror.message).toContain('S3');
    expect(new MetroUnavailableError(19000, cause)).toMatchObject({ port: 19000, cause });
    expect(new ReactNativeAppNotFoundError('Pixel 8').deviceName).toBe('Pixel 8');
  });

  it('distinguishes domain errors from other values', () => {
    expect(isReflectError(new NoDeviceError())).toBe(true);
    expect(isReflectError(new Error('plain'))).toBe(false);
    expect(isReflectError('text')).toBe(false);
  });
});
