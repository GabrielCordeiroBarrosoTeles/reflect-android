import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { IScrcpyLauncher, IServerBinary, MirrorOptions, ScrcpyClientLike } from '../../src/scrcpy/types';
import type { Adb } from '@yume-chan/adb';
import { FakeControlWriter } from './FakeControlWriter';
import { PushStream } from './PushStream';

type SizeListener = (size: { width: number; height: number }) => void;

export class FakeScrcpyClient {
  readonly writer = new FakeControlWriter();
  readonly video = new PushStream<ScrcpyMediaStreamPacket>();
  readonly output = new PushStream<string>();
  readonly clipboard = new PushStream<string>();
  readonly sizeListeners = new Set<SizeListener>();
  metadata: { codec: number; width?: number; height?: number } = { codec: 0x68323634, width: 1080, height: 2400 };
  hasClipboard = true;
  videoFailure: Error | undefined;
  closeFailure: Error | undefined;
  closed = 0;
  private resolveExit!: () => void;
  private rejectExit!: (error: Error) => void;
  readonly exited = new Promise<void>((resolve, reject) => {
    this.resolveExit = resolve;
    this.rejectExit = reject;
  });

  exit(): void {
    this.resolveExit();
  }

  crash(error: Error): void {
    this.rejectExit(error);
  }

  resize(width: number, height: number): void {
    for (const listener of this.sizeListeners) {
      listener({ width, height });
    }
  }

  asClient(): ScrcpyClientLike {
    const videoStream = this.videoFailure
      ? Promise.reject(this.videoFailure)
      : Promise.resolve({
          metadata: this.metadata,
          stream: this.video.stream,
          sizeChanged: (listener: SizeListener) => {
            this.sizeListeners.add(listener);
            return () => this.sizeListeners.delete(listener);
          },
        });
    videoStream.catch(() => undefined);
    return {
      controller: this.writer.asWriter(),
      videoStream,
      output: this.output.stream,
      clipboard: this.hasClipboard ? this.clipboard.stream : undefined,
      exited: this.exited,
      close: () => {
        this.closed += 1;
        return this.closeFailure ? Promise.reject(this.closeFailure) : Promise.resolve();
      },
    } as unknown as ScrcpyClientLike;
  }
}

export class FakeScrcpyLauncher implements IScrcpyLauncher {
  readonly client = new FakeScrcpyClient();
  readonly launches: { adb: Adb; binary: IServerBinary; options: MirrorOptions }[] = [];
  failure: unknown;

  launch(adb: Adb, binary: IServerBinary, options: MirrorOptions): Promise<ScrcpyClientLike> {
    this.launches.push({ adb, binary, options });
    return this.failure === undefined ? Promise.resolve(this.client.asClient()) : Promise.reject(this.failure);
  }
}
