import { ReadableStream } from '@yume-chan/stream-extra';

export class PushStream<T> {
  private controller!: ReadableStreamDefaultController<T>;
  readonly stream = new ReadableStream<T>({
    start: (controller) => {
      this.controller = controller as unknown as ReadableStreamDefaultController<T>;
    },
  });

  push(value: T): void {
    this.controller.enqueue(value);
  }

  close(): void {
    this.controller.close();
  }

  fail(error: Error): void {
    this.controller.error(error);
  }
}

export const flushPromises = async (rounds = 5): Promise<void> => {
  for (let index = 0; index < rounds; index += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};
