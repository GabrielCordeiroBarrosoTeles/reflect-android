import { vi } from 'vitest';
import type { WebviewToHostMessage } from '../../../src/shared/protocol';
import { CanvasPointMapper } from '../../../src/webview/input/CanvasPointMapper';
import { FrameScheduler } from '../../../src/webview/input/FrameScheduler';

export const createCanvas = (): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 200;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 200, right: 100, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
  const captured = new Set<number>();
  canvas.setPointerCapture = (id: number) => captured.add(id);
  canvas.releasePointerCapture = (id: number) => captured.delete(id);
  canvas.hasPointerCapture = (id: number) => captured.has(id);
  document.body.append(canvas);
  return canvas;
};

export const createHarness = () => {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = createCanvas();
  const messages: WebviewToHostMessage[] = [];
  const runFrame = () => frames.splice(0).forEach((callback) => callback(0));
  return {
    canvas,
    messages,
    runFrame,
    scheduler: new FrameScheduler(),
    mapper: new CanvasPointMapper(canvas),
    send: (message: WebviewToHostMessage) => messages.push(message),
  };
};

export const pointer = (type: string, init: { x?: number; y?: number; button?: number; pointerId?: number; altKey?: boolean } = {}) =>
  new PointerEvent(type, {
    clientX: init.x ?? 50,
    clientY: init.y ?? 100,
    button: init.button ?? 0,
    pointerId: init.pointerId ?? 1,
    altKey: init.altKey ?? false,
    bubbles: true,
    cancelable: true,
  });
