// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoPacket } from '../../src/shared/protocol';

const state = vi.hoisted(() => ({
  supported: true,
  webgl: true,
  failWrites: false,
  decoders: [] as {
    options: { codec: number; renderer: { kind: string }; hardwareAcceleration: string };
    written: unknown[];
    disposed: number;
    framesRendered: number;
  }[],
}));

vi.mock('@yume-chan/scrcpy-decoder-webcodecs', () => {
  class Renderer {
    constructor(readonly canvas: HTMLCanvasElement) {}
  }
  return {
    WebGLVideoFrameRenderer: class extends Renderer {
      readonly kind = 'webgl';
      static get isSupported() {
        return state.webgl;
      }
    },
    BitmapVideoFrameRenderer: class extends Renderer {
      readonly kind = 'bitmap';
    },
    WebCodecsVideoDecoder: class {
      static get isSupported() {
        return state.supported;
      }
      written: unknown[] = [];
      disposed = 0;
      framesRendered = 0;
      readonly writable = new WritableStream({
        write: (packet) => {
          if (state.failWrites) {
            throw new Error('decode failed');
          }
          this.written.push(packet);
        },
      });
      constructor(readonly options: never) {
        state.decoders.push(this as never);
      }
      snapshotResult: Blob | undefined = new Blob([new Uint8Array([9, 8])]);
      snapshot() {
        return Promise.resolve(this.snapshotResult);
      }
      dispose() {
        this.disposed += 1;
      }
    },
  };
});

const { VideoRenderer } = await import('../../src/webview/VideoRenderer');

const configuration: VideoPacket = { kind: 'configuration', data: new Uint8Array([1]), keyframe: undefined, pts: undefined };
const keyframe: VideoPacket = { kind: 'data', data: new Uint8Array([2]), keyframe: true, pts: 33 };
const delta: VideoPacket = { kind: 'data', data: new Uint8Array([3]), keyframe: undefined, pts: undefined };

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const setup = () => {
  const canvas = document.createElement('canvas');
  const listener = { onDecoderFailure: vi.fn(), onResyncNeeded: vi.fn() };
  return { canvas, listener, renderer: new VideoRenderer(canvas, 'prefer-hardware', listener) };
};

beforeEach(() => {
  state.supported = true;
  state.webgl = true;
  state.failWrites = false;
  state.decoders.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('VideoRenderer', () => {
  it('reports WebCodecs support', () => {
    expect(VideoRenderer.isSupported).toBe(true);
    state.supported = false;
    expect(VideoRenderer.isSupported).toBe(false);
  });

  it('creates a hardware decoder with the WebGL renderer and keeps the aspect ratio', () => {
    const { renderer, canvas } = setup();
    renderer.configure({ codec: 7, width: 1080, height: 2400 });
    expect(canvas.style.aspectRatio).toBe('1080 / 2400');
    expect(state.decoders[0]?.options).toMatchObject({ codec: 7, hardwareAcceleration: 'prefer-hardware', renderer: { kind: 'webgl' } });
  });

  it('falls back to the bitmap renderer without WebGL', () => {
    state.webgl = false;
    setup().renderer.configure({ codec: 7, width: 0, height: 0 });
    expect(state.decoders[0]?.options.renderer.kind).toBe('bitmap');
  });

  it('keeps the decoder when only the size changes and recreates it for a new codec', () => {
    const { renderer, canvas } = setup();
    renderer.configure({ codec: 7, width: 1080, height: 2400 });
    renderer.configure({ codec: 7, width: 2400, height: 1080 });
    expect(state.decoders).toHaveLength(1);
    expect(canvas.style.aspectRatio).toBe('2400 / 1080');
    renderer.configure({ codec: 8, width: 2400, height: 1080 });
    expect(state.decoders).toHaveLength(2);
    expect(state.decoders[0]?.disposed).toBe(1);
  });

  it('ignores packets before configure', () => {
    const { renderer } = setup();
    renderer.render(configuration);
    expect(renderer.framesRendered).toBe(0);
  });

  it('writes gated packets converting pts back to bigint', async () => {
    const { renderer } = setup();
    renderer.configure({ codec: 7, width: 1, height: 1 });
    renderer.render(delta);
    renderer.render(configuration);
    renderer.render(keyframe);
    renderer.render(delta);
    await settle();
    expect(state.decoders[0]?.written).toEqual([
      { type: 'configuration', data: new Uint8Array([1]) },
      { type: 'data', data: new Uint8Array([2]), keyframe: true, pts: 33n },
      { type: 'data', data: new Uint8Array([3]) },
    ]);
  });

  it('exposes rendered frames', () => {
    const { renderer } = setup();
    renderer.configure({ codec: 7, width: 1, height: 1 });
    state.decoders[0]!.framesRendered = 5;
    expect(renderer.framesRendered).toBe(5);
  });

  it('recovers from decoder failures with backoff and asks for a resync', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { renderer, listener } = setup();
    renderer.configure({ codec: 7, width: 1, height: 1 });
    state.failWrites = true;
    renderer.render(configuration);
    await vi.waitFor(() => expect(listener.onDecoderFailure).toHaveBeenCalledOnce());
    expect(state.decoders[0]?.disposed).toBe(1);
    renderer.render(configuration);
    vi.advanceTimersByTime(250);
    expect(state.decoders).toHaveLength(2);
    expect(state.decoders[1]?.options.codec).toBe(7);
    expect(listener.onResyncNeeded).toHaveBeenCalledOnce();
  });

  it('resets the backoff once frames are rendered again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { renderer, listener } = setup();
    renderer.configure({ codec: 7, width: 1, height: 1 });
    state.failWrites = true;
    renderer.render(configuration);
    await vi.waitFor(() => expect(listener.onDecoderFailure).toHaveBeenCalledTimes(1));
    vi.advanceTimersByTime(250);
    state.failWrites = false;
    state.decoders[1]!.framesRendered = 3;
    renderer.render(configuration);
    state.failWrites = true;
    renderer.render(keyframe);
    await vi.waitFor(() => expect(listener.onDecoderFailure).toHaveBeenCalledTimes(2));
    vi.advanceTimersByTime(250);
    expect(state.decoders).toHaveLength(3);
  });

  it('captures the last decoded frame as PNG bytes', async () => {
    const { renderer } = setup();
    expect(await renderer.snapshot()).toBeUndefined();
    renderer.configure({ codec: 7, width: 1, height: 1 });
    expect(await renderer.snapshot()).toEqual(new Uint8Array([9, 8]));
    (state.decoders[0] as unknown as { snapshotResult: Blob | undefined }).snapshotResult = undefined;
    expect(await renderer.snapshot()).toBeUndefined();
  });

  it('ignores failures from a decoder that was already replaced', async () => {
    const { renderer, listener } = setup();
    renderer.configure({ codec: 7, width: 1, height: 1 });
    state.failWrites = true;
    renderer.render(configuration);
    renderer.dispose();
    await settle();
    expect(listener.onDecoderFailure).not.toHaveBeenCalled();
  });
});
