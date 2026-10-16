// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { PINCH_START_OFFSET, containedContentRect, mirrorAround, pinchCenterFor, toNormalizedPoint } from '../../../src/webview/input/coordinates';

describe('containedContentRect', () => {
  it('letterboxes horizontally when the element is wider than the video', () => {
    expect(containedContentRect({ left: 0, top: 0, width: 1000, height: 500 }, 500, 1000)).toEqual({ left: 375, top: 0, width: 250, height: 500 });
  });

  it('letterboxes vertically when the element is taller than the video', () => {
    expect(containedContentRect({ left: 10, top: 20, width: 400, height: 1000 }, 1000, 500)).toEqual({ left: 10, top: 420, width: 400, height: 200 });
  });

  it.each([
    [0, 100, 100, 100],
    [100, 0, 100, 100],
    [100, 100, 0, 100],
    [100, 100, 100, 0],
  ])('returns the element when any size is unknown (%i, %i, %i, %i)', (videoWidth, videoHeight, width, height) => {
    const element = { left: 1, top: 2, width, height };
    expect(containedContentRect(element, videoWidth, videoHeight)).toBe(element);
  });
});

describe('toNormalizedPoint', () => {
  const content = { left: 100, top: 50, width: 200, height: 400 };

  it('normalizes points inside the content', () => {
    expect(toNormalizedPoint(200, 250, content)).toEqual({ x: 0.5, y: 0.5, inside: true });
  });

  it.each([
    [50, 250, { x: 0, y: 0.5 }],
    [350, 250, { x: 1, y: 0.5 }],
    [200, 0, { x: 0.5, y: 0 }],
    [200, 500, { x: 0.5, y: 1 }],
  ])('clamps and flags points outside (%i, %i)', (x, y, expected) => {
    expect(toNormalizedPoint(x, y, content)).toEqual({ ...expected, inside: false });
  });
});

describe('pinchCenterFor', () => {
  it('places the pinch center just up-left of the pressed point', () => {
    expect(pinchCenterFor({ x: 0.5, y: 0.3, inside: true })).toEqual({ x: 0.5 - PINCH_START_OFFSET, y: 0.3 - PINCH_START_OFFSET, inside: true });
  });

  it('stays on screen near the top-left corner', () => {
    expect(pinchCenterFor({ x: 0, y: 0.01, inside: true })).toEqual({ x: 0, y: 0, inside: true });
  });
});

describe('mirrorAround', () => {
  it('mirrors a point around the pinch center', () => {
    const mirrored = mirrorAround({ x: 0.6, y: 0.4, inside: true }, { x: 0.5, y: 0.3, inside: true });
    expect(mirrored.x).toBeCloseTo(0.4);
    expect(mirrored.y).toBeCloseTo(0.2);
    expect(mirrored.inside).toBe(true);
  });

  it('clamps the mirrored finger to the screen', () => {
    expect(mirrorAround({ x: 0.9, y: 0.95, inside: false }, { x: 0.2, y: 0.2, inside: true })).toEqual({ x: 0, y: 0, inside: false });
  });
});
