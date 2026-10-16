import type { Adb } from '@yume-chan/adb';

export class FakeAdb {
  closed = 0;
  closeFailure: Error | undefined;

  close(): Promise<void> {
    this.closed += 1;
    return this.closeFailure ? Promise.reject(this.closeFailure) : Promise.resolve();
  }

  asAdb(): Adb {
    return this as unknown as Adb;
  }
}
