import { Emitter } from '../../src/core/Emitter';
import type { ChildProcessLike, HelperCommand, HelperFrame, IHelperProcess } from '../../src/ios/types';

const frame = (type: number, payload: Uint8Array): Uint8Array => {
  const bytes = new Uint8Array(5 + payload.length);
  new DataView(bytes.buffer).setUint32(1, payload.length);
  bytes[0] = type;
  bytes.set(payload, 5);
  return bytes;
};

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

export const helloBytes = (hello: unknown = HELLO): Uint8Array => frame(0x01, json(hello));

export const videoConfigBytes = (width: number, height: number, parameterSets: readonly number[]): Uint8Array => {
  const payload = new Uint8Array(4 + parameterSets.length);
  new DataView(payload.buffer).setUint16(0, width);
  new DataView(payload.buffer).setUint16(2, height);
  payload.set(parameterSets, 4);
  return frame(0x02, payload);
};

export const videoFrameBytes = (keyframe: boolean, ptsMicros: number, data: readonly number[]): Uint8Array => {
  const payload = new Uint8Array(9 + data.length);
  payload[0] = keyframe ? 1 : 0;
  new DataView(payload.buffer).setBigUint64(1, BigInt(ptsMicros));
  payload.set(data, 9);
  return frame(0x03, payload);
};

export const eventBytes = (event: unknown): Uint8Array => frame(0x04, json(event));

export const rawFrameBytes = frame;

export const HELLO = {
  protocol: 1,
  xcodeVersion: '26.6',
  device: { name: 'iPhone 15', pointWidth: 393, pointHeight: 852, scale: 3 },
  capabilities: ['touch'],
};

export class FakeHelperProcess implements IHelperProcess {
  private readonly frames = new Emitter<HelperFrame>();
  private readonly exits = new Emitter<{ code: number | null }>();
  readonly sent: HelperCommand[] = [];
  disposed = false;

  readonly onFrame = this.frames.event;
  readonly onExit = this.exits.event;

  send(command: HelperCommand): void {
    this.sent.push(command);
  }

  emit(frame: HelperFrame): void {
    this.frames.fire(frame);
  }

  hello(): void {
    this.emit({ kind: 'hello', hello: HELLO });
  }

  config(width: number, height: number, data: readonly number[] = [0, 0, 0, 1, 0x67]): void {
    this.emit({ kind: 'video-config', width, height, data: new Uint8Array(data) });
  }

  frame(keyframe = true, pts = 0, data: readonly number[] = [0, 0, 0, 1, 0x65]): void {
    this.emit({ kind: 'video-frame', keyframe, pts, data: new Uint8Array(data) });
  }

  event(event: { type: string; code?: string; message?: string }): void {
    this.emit({ kind: 'event', event });
  }

  exit(code: number | null): void {
    this.exits.fire({ code });
  }

  dispose(): void {
    this.disposed = true;
  }
}

type Listener = (...args: never[]) => void;

class FakeReadable {
  private listener: ((chunk: Uint8Array) => void) | undefined;

  on(_event: 'data', listener: (chunk: Uint8Array) => void): this {
    this.listener = listener;
    return this;
  }

  emit(chunk: Uint8Array | string): void {
    this.listener?.(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
  }
}

export class FakeChildProcess implements ChildProcessLike {
  readonly stdout = new FakeReadable();
  readonly stderr = new FakeReadable();
  readonly written: string[] = [];
  readonly stdin = {
    write: (data: string) => this.written.push(data),
    on: (_event: 'error', listener: (error: Error) => void) => {
      this.stdinError = listener;
    },
  };
  stdinError: ((error: Error) => void) | undefined;
  readonly listeners = new Map<string, Listener>();
  killed = 0;

  on(event: 'exit' | 'error', listener: Listener): this {
    this.listeners.set(event, listener);
    return this;
  }

  kill(): boolean {
    this.killed += 1;
    return true;
  }

  exit(code: number | null): void {
    (this.listeners.get('exit') as (code: number | null) => void)(code);
  }

  fail(error: Error): void {
    (this.listeners.get('error') as (error: Error) => void)(error);
  }
}
