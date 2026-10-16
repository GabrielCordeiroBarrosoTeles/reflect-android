import { containedContentRect, toNormalizedPoint } from './coordinates';
import type { NormalizedPoint } from './types';

export class CanvasPointMapper {
  constructor(private readonly canvas: HTMLCanvasElement) {}

  map(event: { readonly clientX: number; readonly clientY: number }): NormalizedPoint {
    const content = containedContentRect(this.canvas.getBoundingClientRect(), this.canvas.width, this.canvas.height);
    return toNormalizedPoint(event.clientX, event.clientY, content);
  }
}
