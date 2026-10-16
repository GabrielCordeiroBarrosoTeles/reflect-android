import { readFile } from 'node:fs/promises';
import type { MaybeConsumable } from '@yume-chan/stream-extra';
import { ReadableStream } from '@yume-chan/stream-extra';
import type { IServerBinary } from './types';

export class FileServerBinary implements IServerBinary {
  constructor(
    private readonly path: string,
    readonly version: string,
  ) {}

  async open(): Promise<ReadableStream<MaybeConsumable<Uint8Array>>> {
    const content = new Uint8Array(await readFile(this.path));
    return new ReadableStream<MaybeConsumable<Uint8Array>>({
      start(controller) {
        controller.enqueue(content);
        controller.close();
      },
    });
  }
}
