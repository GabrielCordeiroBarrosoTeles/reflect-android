export type ReflectErrorCode =
  | 'adb-not-found'
  | 'adb-server-unavailable'
  | 'no-device'
  | 'device-unauthorized'
  | 'device-offline'
  | 'mirror-failed'
  | 'metro-unavailable'
  | 'react-native-app-not-found'
  | 'ios-helper-unavailable'
  | 'xcode-unsupported'
  | 'simulator-not-booted';

export abstract class ReflectError extends Error {
  abstract readonly code: ReflectErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class AdbNotFoundError extends ReflectError {
  readonly code = 'adb-not-found';

  constructor(readonly searchedPaths: readonly string[]) {
    super('adb executable not found');
  }
}

export class AdbServerUnavailableError extends ReflectError {
  readonly code = 'adb-server-unavailable';

  constructor(cause?: unknown) {
    super('Unable to reach the adb server', { cause });
  }
}

export class NoDeviceError extends ReflectError {
  readonly code = 'no-device';

  constructor() {
    super('No Android device connected');
  }
}

export class DeviceUnauthorizedError extends ReflectError {
  readonly code = 'device-unauthorized';

  constructor(readonly serial: string) {
    super(`Device ${serial} is not authorized`);
  }
}

export class DeviceOfflineError extends ReflectError {
  readonly code = 'device-offline';

  constructor(readonly serial: string) {
    super(`Device ${serial} is offline`);
  }
}

export class MirrorStartError extends ReflectError {
  readonly code = 'mirror-failed';

  constructor(
    readonly serial: string,
    readonly details: readonly string[],
    cause?: unknown,
  ) {
    super(`Unable to start mirroring on ${serial}`, { cause });
  }
}

export class MetroUnavailableError extends ReflectError {
  readonly code = 'metro-unavailable';

  constructor(
    readonly port: number,
    cause?: unknown,
  ) {
    super(`Metro is not reachable on port ${port}`, { cause });
  }
}

export class ReactNativeAppNotFoundError extends ReflectError {
  readonly code = 'react-native-app-not-found';

  constructor(readonly deviceName: string) {
    super(`No debuggable React Native app found on ${deviceName}`);
  }
}

export class IosHelperUnavailableError extends ReflectError {
  readonly code = 'ios-helper-unavailable';

  constructor(
    readonly path: string,
    cause?: unknown,
  ) {
    super(`The iOS helper is missing or not executable: ${path}`, { cause });
  }
}

export class XcodeUnsupportedError extends ReflectError {
  readonly code = 'xcode-unsupported';

  constructor(
    readonly xcodeVersion: string | undefined,
    readonly missing: readonly string[],
  ) {
    super(`Xcode ${xcodeVersion ?? '(unknown version)'} is not supported`);
  }
}

export class SimulatorNotBootedError extends ReflectError {
  readonly code = 'simulator-not-booted';

  constructor(readonly simulatorName: string) {
    super(`${simulatorName} is not booted`);
  }
}

export const isReflectError = (error: unknown): error is ReflectError => error instanceof ReflectError;
