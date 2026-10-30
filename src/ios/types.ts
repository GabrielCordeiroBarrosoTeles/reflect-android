import type { Event, IDisposable } from '../core/types';

export interface ISimctl {
  run(args: readonly string[], input?: string): Promise<string>;
}

export interface ChildInput {
  end(data: string): void;
}

export type SimctlExecFile = (
  file: string,
  args: string[],
  options: { readonly timeout: number },
  callback: (error: Error | null, stdout: string) => void,
) => { readonly stdin: ChildInput | null };

export interface HelperHello {
  readonly protocol: number;
  readonly xcodeVersion: string;
  readonly device: {
    readonly name: string;
    readonly pointWidth: number;
    readonly pointHeight: number;
    readonly scale: number;
  };
  readonly capabilities: readonly string[];
}

export interface HelperEvent {
  readonly type: string;
  readonly code?: string;
  readonly message?: string;
}

export type HelperCommand =
  | { readonly type: 'touch'; readonly phase: 'down' | 'move' | 'up'; readonly x: number; readonly y: number; readonly id: number }
  | { readonly type: 'scroll'; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number }
  | { readonly type: 'key'; readonly usage: number; readonly down: boolean }
  | { readonly type: 'button'; readonly name: string; readonly down: boolean }
  | { readonly type: 'rotate' }
  | { readonly type: 'keyframe' }
  | { readonly type: 'quality'; readonly bitrate: number; readonly fps: number; readonly maxSize: number }
  | { readonly type: 'simulatorApp'; readonly action: 'hide' | 'show' }
  | { readonly type: 'stop' };

export type HelperFrame =
  | { readonly kind: 'hello'; readonly hello: HelperHello }
  | { readonly kind: 'video-config'; readonly width: number; readonly height: number; readonly data: Uint8Array }
  | { readonly kind: 'video-frame'; readonly keyframe: boolean; readonly pts: number; readonly data: Uint8Array }
  | { readonly kind: 'event'; readonly event: HelperEvent };

export interface IHelperProcess extends IDisposable {
  readonly onFrame: Event<HelperFrame>;
  readonly onExit: Event<{ readonly code: number | null }>;
  send(command: HelperCommand): void;
}

export type HelperProcessFactory = (udid: string) => Promise<IHelperProcess>;

export interface ReadableLike {
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
}

export interface ChildProcessLike {
  readonly stdout: ReadableLike;
  readonly stderr: ReadableLike;
  readonly stdin: { write(data: string): unknown; on(event: 'error', listener: (error: Error) => void): unknown };
  on(event: 'exit', listener: (code: number | null) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  kill(): unknown;
}

export type SpawnFunction = (file: string, args: readonly string[]) => ChildProcessLike;
