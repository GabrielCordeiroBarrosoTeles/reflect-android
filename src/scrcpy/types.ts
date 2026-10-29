import type { MaybeConsumable, ReadableStream } from '@yume-chan/stream-extra';
import type { Adb } from '@yume-chan/adb';
import type { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy';

export interface IServerBinary {
  readonly version: string;
  open(): Promise<ReadableStream<MaybeConsumable<Uint8Array>>>;
}

export interface MirrorOptions {
  readonly maxSize: number;
  readonly videoBitRate: number;
  readonly maxFps: number;
}

export type ScrcpyClientLike = Pick<
  AdbScrcpyClient<AdbScrcpyOptionsLatest<true>>,
  'controller' | 'videoStream' | 'output' | 'clipboard' | 'exited' | 'close'
>;

export interface IScrcpyLauncher {
  launch(adb: Adb, binary: IServerBinary, options: MirrorOptions): Promise<ScrcpyClientLike>;
}
