import type { IClipboard } from '../../src/mirror/types';

export class FakeClipboard implements IClipboard {
  constructor(public text = '') {}

  readText(): Promise<string> {
    return Promise.resolve(this.text);
  }

  writeText(text: string): Promise<void> {
    this.text = text;
    return Promise.resolve();
  }
}
