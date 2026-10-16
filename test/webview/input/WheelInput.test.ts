// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { WheelInput } from '../../../src/webview/input/WheelInput';
import { WheelPinch } from '../../../src/webview/input/WheelPinch';
import { createHarness } from './helpers';

const wheel = (init: { deltaX?: number; deltaY?: number; deltaMode?: number; x?: number; ctrlKey?: boolean; altKey?: boolean }) => {
  const event = new WheelEvent('wheel', {
    deltaX: init.deltaX ?? 0,
    deltaY: init.deltaY ?? 0,
    deltaMode: init.deltaMode ?? 0,
    ctrlKey: init.ctrlKey ?? false,
    altKey: init.altKey ?? false,
    cancelable: true,
  });
  Object.defineProperties(event, {
    clientX: { value: init.x ?? 50 },
    clientY: { value: 100 },
    ctrlKey: { value: init.ctrlKey ?? false },
    altKey: { value: init.altKey ?? false },
  });
  return event;
};

const setup = () => {
  const harness = createHarness();
  const zooms: { x: number; deltaPixels: number }[] = [];
  const pinch = { zoom: (point: { x: number }, deltaPixels: number) => zooms.push({ x: point.x, deltaPixels }), dispose: vi.fn() };
  const input = new WheelInput(harness.canvas, harness.mapper, harness.scheduler, harness.send, pinch as unknown as WheelPinch);
  return { ...harness, input, zooms, pinch };
};

describe('WheelInput', () => {
  it('accumulates pixel deltas per frame and inverts the vertical axis', () => {
    const { canvas, messages, runFrame } = setup();
    const event = wheel({ deltaY: 50 });
    canvas.dispatchEvent(event);
    canvas.dispatchEvent(wheel({ deltaY: 50, deltaX: 20 }));
    runFrame();
    expect(event.defaultPrevented).toBe(true);
    expect(messages).toEqual([{ type: 'scroll', input: { x: 0.5, y: 0.5, scrollX: 0.2, scrollY: -1 } }]);
  });

  it.each([
    [1, 3, -1],
    [2, 1, -1],
  ])('converts delta mode %i', (deltaMode, deltaY, expected) => {
    const { canvas, messages, runFrame } = setup();
    canvas.dispatchEvent(wheel({ deltaY, deltaMode }));
    runFrame();
    expect(messages[0]).toMatchObject({ input: { scrollY: expected } });
  });

  it('starts a fresh accumulation after each flush', () => {
    const { canvas, messages, runFrame } = setup();
    canvas.dispatchEvent(wheel({ deltaY: 100 }));
    runFrame();
    canvas.dispatchEvent(wheel({ deltaY: -100 }));
    runFrame();
    expect(messages.map((message) => message.type === 'scroll' && message.input.scrollY)).toEqual([-1, 1]);
  });

  it.each([
    ['a trackpad pinch', { ctrlKey: true, deltaY: -8 }, -8],
    ['Option + wheel in lines', { altKey: true, deltaY: 3, deltaMode: 1 }, 120],
    ['Option + wheel in pages', { altKey: true, deltaY: 1, deltaMode: 2 }, 800],
  ])('turns %s into a pinch zoom instead of scrolling', (_label, init, deltaPixels) => {
    const { canvas, messages, runFrame, zooms } = setup();
    const event = wheel(init);
    canvas.dispatchEvent(event);
    runFrame();
    expect(event.defaultPrevented).toBe(true);
    expect(zooms).toEqual([{ x: 0.5, deltaPixels }]);
    expect(messages).toEqual([]);
  });

  it('disposes the pinch helper', () => {
    const { input, pinch } = setup();
    input.dispose();
    expect(pinch.dispose).toHaveBeenCalledOnce();
  });

  it('ignores wheel events outside the video and after dispose', () => {
    const { canvas, messages, runFrame, input } = setup();
    canvas.dispatchEvent(wheel({ deltaY: 100, x: 500 }));
    input.dispose();
    canvas.dispatchEvent(wheel({ deltaY: 100 }));
    runFrame();
    expect(messages).toEqual([]);
  });
});
