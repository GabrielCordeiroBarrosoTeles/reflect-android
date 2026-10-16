import type { AdbServerClient } from '@yume-chan/adb';

type Listener<T> = (value: T) => void;

class FakeEvent<T> {
  readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }
}

export class FakeDeviceObserver {
  private readonly listChange = new FakeEvent<readonly AdbServerClient.Device[]>();
  private readonly error = new FakeEvent<Error>();
  stopped = 0;

  constructor(public current: readonly AdbServerClient.Device[] = []) {}

  emitList(devices: readonly AdbServerClient.Device[]): void {
    this.current = devices;
    this.listChange.fire(devices);
  }

  emitError(error: Error): void {
    this.error.fire(error);
  }

  asObserver(): AdbServerClient.DeviceObserver {
    return {
      current: this.current,
      onListChange: this.listChange.event,
      onDeviceAdd: new FakeEvent<readonly AdbServerClient.Device[]>().event,
      onDeviceRemove: new FakeEvent<readonly AdbServerClient.Device[]>().event,
      onError: this.error.event,
      stop: () => {
        this.stopped += 1;
      },
    } as unknown as AdbServerClient.DeviceObserver;
  }
}
