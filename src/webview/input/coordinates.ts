import type { ContentRect, NormalizedPoint } from './types';

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

export const containedContentRect = (element: ContentRect, intrinsicWidth: number, intrinsicHeight: number): ContentRect => {
  if (intrinsicWidth <= 0 || intrinsicHeight <= 0 || element.width <= 0 || element.height <= 0) {
    return element;
  }
  const scale = Math.min(element.width / intrinsicWidth, element.height / intrinsicHeight);
  const width = intrinsicWidth * scale;
  const height = intrinsicHeight * scale;
  return {
    left: element.left + (element.width - width) / 2,
    top: element.top + (element.height - height) / 2,
    width,
    height,
  };
};

export const toNormalizedPoint = (clientX: number, clientY: number, content: ContentRect): NormalizedPoint => {
  const x = (clientX - content.left) / content.width;
  const y = (clientY - content.top) / content.height;
  return {
    x: clampUnit(x),
    y: clampUnit(y),
    inside: x >= 0 && x <= 1 && y >= 0 && y <= 1,
  };
};

export const PINCH_START_OFFSET = 0.04;

export const pinchCenterFor = (start: NormalizedPoint): NormalizedPoint => ({
  x: clampUnit(start.x - PINCH_START_OFFSET),
  y: clampUnit(start.y - PINCH_START_OFFSET),
  inside: true,
});

export const mirrorAround = (point: NormalizedPoint, center: NormalizedPoint): NormalizedPoint => ({
  x: clampUnit(2 * center.x - point.x),
  y: clampUnit(2 * center.y - point.y),
  inside: point.inside,
});
