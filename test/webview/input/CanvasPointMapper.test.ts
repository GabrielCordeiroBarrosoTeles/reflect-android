// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CanvasPointMapper } from '../../../src/webview/input/CanvasPointMapper';
import { createCanvas } from './helpers';

describe('CanvasPointMapper', () => {
  it('maps client coordinates using the letterboxed video area', () => {
    const canvas = createCanvas();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    const mapper = new CanvasPointMapper(canvas);
    expect(mapper.map({ clientX: 100, clientY: 100 })).toEqual({ x: 0.5, y: 0.5, inside: true });
    expect(mapper.map({ clientX: 10, clientY: 100 })).toEqual({ x: 0, y: 0.5, inside: false });
  });
});
