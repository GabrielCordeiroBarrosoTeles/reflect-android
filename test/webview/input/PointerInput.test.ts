// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { PointerInput } from '../../../src/webview/input/PointerInput';
import { createHarness, pointer } from './helpers';

const setup = () => {
  const harness = createHarness();
  const inspectMode = { active: false };
  const input = new PointerInput(harness.canvas, harness.mapper, harness.scheduler, harness.send, inspectMode);
  return { ...harness, input, inspectMode };
};

describe('PointerInput', () => {
  it('sends a primary finger gesture with coalesced moves', () => {
    const { canvas, messages, runFrame } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { x: 50, y: 100 }));
    canvas.dispatchEvent(pointer('pointermove', { x: 60, y: 100 }));
    canvas.dispatchEvent(pointer('pointermove', { x: 70, y: 100 }));
    runFrame();
    canvas.dispatchEvent(pointer('pointermove', { x: 80, y: 100 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 90, y: 100 }));
    expect(messages).toEqual([
      { type: 'touch', input: { action: 'down', pointer: 'primary', x: 0.5, y: 0.5 } },
      { type: 'touch', input: { action: 'move', pointer: 'primary', x: 0.7, y: 0.5 } },
      { type: 'touch', input: { action: 'move', pointer: 'primary', x: 0.8, y: 0.5 } },
      { type: 'touch', input: { action: 'up', pointer: 'primary', x: 0.9, y: 0.5 } },
    ]);
    expect(canvas.hasPointerCapture(1)).toBe(false);
    expect(document.activeElement).toBe(canvas);
  });

  it('pinches around the pressed point while Option is held', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { x: 50, y: 60, altKey: true }));
    canvas.dispatchEvent(pointer('pointercancel', { x: 60, y: 80 }));
    const round = (value: number) => Math.round(value * 100) / 100;
    expect(messages.map((message) => message.type === 'touch' && [message.input.action, message.input.pointer, round(message.input.x), round(message.input.y)])).toEqual([
      ['down', 'primary', 0.5, 0.3],
      ['down', 'virtual', 0.42, 0.22],
      ['cancel', 'primary', 0.6, 0.4],
      ['cancel', 'virtual', 0.32, 0.12],
    ]);
  });

  it('stops pinching after the gesture ends', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { altKey: true }));
    canvas.dispatchEvent(pointer('pointerup'));
    canvas.dispatchEvent(pointer('pointerdown'));
    expect(messages.filter((message) => message.type === 'touch' && message.input.pointer === 'virtual')).toHaveLength(2);
  });

  it('maps the secondary button to back and the middle button to home', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { button: 2 }));
    canvas.dispatchEvent(pointer('pointerdown', { button: 1 }));
    expect(messages).toEqual([
      { type: 'mouse-shortcut', shortcut: 'back' },
      { type: 'mouse-shortcut', shortcut: 'home' },
    ]);
  });

  it('suppresses the context menu', () => {
    const { canvas } = setup();
    const event = new MouseEvent('contextmenu', { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('ignores other buttons, extra pointers and presses outside the video', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(pointer('pointerdown', { button: 3 }));
    canvas.dispatchEvent(pointer('pointerdown', { x: 500, y: 100 }));
    canvas.dispatchEvent(pointer('pointerdown', { pointerId: 1 }));
    canvas.dispatchEvent(pointer('pointerdown', { pointerId: 2 }));
    canvas.dispatchEvent(pointer('pointermove', { pointerId: 2 }));
    canvas.dispatchEvent(pointer('pointerup', { pointerId: 2 }));
    expect(messages).toHaveLength(1);
  });

  it('handles a release after the capture was already lost', () => {
    const { canvas, messages } = setup();
    canvas.dispatchEvent(pointer('pointerdown'));
    canvas.releasePointerCapture(1);
    canvas.dispatchEvent(pointer('pointerup'));
    expect(messages.map((message) => message.type === 'touch' && message.input.action)).toEqual(['down', 'up']);
  });

  it('sends coalesced hover positions inside the screen while inspecting', () => {
    const { canvas, messages, inspectMode, runFrame } = setup();
    canvas.dispatchEvent(pointer('pointermove', { x: 10, y: 20 }));
    inspectMode.active = true;
    canvas.dispatchEvent(pointer('pointermove', { x: 20, y: 20 }));
    canvas.dispatchEvent(pointer('pointermove', { x: 30, y: 40 }));
    canvas.dispatchEvent(pointer('pointermove', { x: 300, y: 40 }));
    runFrame();
    expect(messages).toEqual([{ type: 'inspect-hover', x: 0.3, y: 0.2 }]);
  });

  it('sends inspect clicks instead of touches in inspect mode', () => {
    const { canvas, messages, inspectMode } = setup();
    inspectMode.active = true;
    canvas.dispatchEvent(pointer('pointerdown', { x: 50, y: 100 }));
    canvas.dispatchEvent(pointer('pointerup', { x: 50, y: 100 }));
    expect(messages).toEqual([{ type: 'inspect-at', x: 0.5, y: 0.5 }]);
  });

  it('stops listening after dispose', () => {
    const { canvas, messages, input } = setup();
    input.dispose();
    canvas.dispatchEvent(pointer('pointerdown'));
    expect(messages).toEqual([]);
  });
});
