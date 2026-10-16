import type { ScrcpyControlMessageWriter } from '@yume-chan/scrcpy';

export class FakeControlWriter {
  readonly calls: { method: string; args: unknown[] }[] = [];

  private record(method: string, ...args: unknown[]): Promise<void> {
    this.calls.push({ method, args });
    return Promise.resolve();
  }

  injectTouch = (message: unknown) => this.record('injectTouch', message);
  injectScroll = (message: unknown) => this.record('injectScroll', message);
  injectKeyCode = (message: unknown) => this.record('injectKeyCode', message);
  injectText = (text: string) => this.record('injectText', text);
  backOrScreenOn = (action: number) => this.record('backOrScreenOn', action);
  setClipboard = (message: unknown) => this.record('setClipboard', message);
  resetVideo = () => this.record('resetVideo');

  methods(): string[] {
    return this.calls.map((call) => call.method);
  }

  asWriter(): ScrcpyControlMessageWriter {
    return this as unknown as ScrcpyControlMessageWriter;
  }
}
