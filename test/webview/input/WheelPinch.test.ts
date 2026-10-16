// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebviewToHostMessage } from '../../../src/shared/protocol';
import { WheelPinch } from '../../../src/webview/input/WheelPinch';
import { createHarness } from './helpers';

const center = { x: 0.5, y: 0.5, inside: true };

const touches = (messages: WebviewToHostMessage[]) =>
  messages.flatMap((message) => (message.type === 'touch' ? [message.input] : []));

const actions = (messages: WebviewToHostMessage[]) => touches(messages).map((input) => `${input.action}:${input.pointer}`);

const spans = (messages: WebviewToHostMessage[], action: string) => {
  const inputs = touches(messages).filter((input) => input.action === action);
  const result: number[] = [];
  for (let index = 0; index < inputs.length; index += 2) {
    result.push(inputs[index]!.x - inputs[index + 1]!.x);
  }
  return result;
};

const settle = (runFrame: () => void, frames = 60) => {
  for (let frame = 0; frame < frames; frame += 1) {
    runFrame();
  }
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('WheelPinch', () => {
  it('puts two fingers around the cursor and glides them apart to zoom in', () => {
    const { scheduler, send, messages, runFrame } = createHarness();
    new WheelPinch(scheduler, send, 400).zoom(center, -60);
    settle(runFrame);
    const moves = spans(messages, 'move');
    expect(actions(messages).slice(0, 2)).toEqual(['down:primary', 'down:virtual']);
    expect(moves.length).toBeGreaterThan(3);
    expect(moves.every((span, index) => index === 0 || span >= moves[index - 1]!)).toBe(true);
    expect(moves.at(-1)).toBeCloseTo(0.12 * Math.exp(0.5));
  });

  it('glides the fingers together to zoom out', () => {
    const { scheduler, send, messages, runFrame } = createHarness();
    new WheelPinch(scheduler, send, 400).zoom(center, 60);
    settle(runFrame);
    expect(spans(messages, 'move').at(-1)).toBeCloseTo(0.12 * Math.exp(-0.5));
  });

  it('limits how far a single wheel notch can jump', () => {
    const { scheduler, send, messages, runFrame } = createHarness();
    new WheelPinch(scheduler, send, 400).zoom(center, -10_000);
    settle(runFrame);
    expect(spans(messages, 'move').at(-1)).toBeCloseTo(0.12 * Math.exp(1));
  });

  it('keeps a sequence of notches as one continuous gesture and releases after going idle', () => {
    const { scheduler, send, messages, runFrame } = createHarness();
    const pinch = new WheelPinch(scheduler, send, 400);
    pinch.zoom(center, -60);
    settle(runFrame, 5);
    vi.advanceTimersByTime(300);
    pinch.zoom(center, -60);
    settle(runFrame, 5);
    vi.advanceTimersByTime(399);
    expect(actions(messages).filter((name) => name.startsWith('down'))).toHaveLength(2);
    expect(actions(messages).filter((name) => name.startsWith('up'))).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(actions(messages).slice(-2)).toEqual(['up:primary', 'up:virtual']);
    expect(spans(messages, 'up')[0]).toBeCloseTo(0.12 * Math.exp(1));
  });

  it('stops animating once the gesture has ended', () => {
    const { scheduler, send, messages, runFrame } = createHarness();
    const pinch = new WheelPinch(scheduler, send, 400);
    pinch.zoom(center, -120);
    runFrame();
    vi.advanceTimersByTime(400);
    const sent = messages.length;
    settle(runFrame);
    expect(messages).toHaveLength(sent);
  });

  it('respects the span limits and keeps the fingers on screen', () => {
    const { scheduler, send, messages, runFrame } = createHarness();
    const pinch = new WheelPinch(scheduler, send, 400);
    for (let notch = 0; notch < 10; notch += 1) {
      pinch.zoom({ x: 0.98, y: 0.02, inside: true }, -120);
    }
    vi.advanceTimersByTime(400);
    const [primary, virtual] = touches(messages).slice(-2);
    expect(primary).toMatchObject({ action: 'up', pointer: 'primary', x: 1 });
    expect(primary?.y).toBeCloseTo(0.47);
    expect(virtual).toMatchObject({ action: 'up', pointer: 'virtual', y: 0 });
    expect(virtual?.x).toBeCloseTo(0.53);
    for (let notch = 0; notch < 20; notch += 1) {
      pinch.zoom(center, 120);
    }
    settle(runFrame);
    vi.advanceTimersByTime(400);
    expect(spans(messages, 'up').at(-1)).toBeCloseTo(0.02);
  });

  it('cancels an active gesture on dispose and ignores dispose when idle', () => {
    const { scheduler, send, messages } = createHarness();
    const pinch = new WheelPinch(scheduler, send);
    pinch.dispose();
    pinch.zoom(center, -10);
    pinch.dispose();
    vi.advanceTimersByTime(1000);
    expect(actions(messages)).toEqual(['down:primary', 'down:virtual', 'move:primary', 'move:virtual', 'cancel:primary', 'cancel:virtual']);
  });
});
