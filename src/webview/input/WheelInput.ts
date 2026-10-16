import type { CanvasPointMapper } from './CanvasPointMapper';
import type { FrameScheduler } from './FrameScheduler';
import type { Disposable, MessageSink, NormalizedPoint } from './types';
import type { WheelPinch } from './WheelPinch';

const SCROLL_TASK = 'wheel-scroll';
const PIXELS_PER_NOTCH = 100;
const LINES_PER_NOTCH = 3;
const PIXELS_PER_LINE = 40;
const PIXELS_PER_PAGE = 800;

const toPixels = (delta: number, mode: number): number => {
  if (mode === WheelEvent.DOM_DELTA_LINE) {
    return delta * PIXELS_PER_LINE;
  }
  if (mode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * PIXELS_PER_PAGE;
  }
  return delta;
};

const toNotches = (delta: number, mode: number): number => {
  if (mode === WheelEvent.DOM_DELTA_PIXEL) {
    return delta / PIXELS_PER_NOTCH;
  }
  if (mode === WheelEvent.DOM_DELTA_LINE) {
    return delta / LINES_PER_NOTCH;
  }
  return delta;
};

export class WheelInput implements Disposable {
  private accumulatedX = 0;
  private accumulatedY = 0;
  private readonly abort = new AbortController();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly mapper: CanvasPointMapper,
    private readonly scheduler: FrameScheduler,
    private readonly send: MessageSink,
    private readonly pinch: WheelPinch,
  ) {
    canvas.addEventListener('wheel', (event) => this.handleWheel(event), { passive: false, signal: this.abort.signal });
  }

  dispose(): void {
    this.abort.abort();
    this.pinch.dispose();
  }

  private handleWheel(event: WheelEvent): void {
    const point = this.mapper.map(event);
    if (!point.inside) {
      return;
    }
    event.preventDefault();
    if (event.ctrlKey || event.altKey) {
      this.pinch.zoom(point, toPixels(event.deltaY, event.deltaMode));
      return;
    }
    this.accumulatedX += toNotches(event.deltaX, event.deltaMode);
    this.accumulatedY += toNotches(event.deltaY, event.deltaMode);
    this.scheduler.schedule(SCROLL_TASK, () => this.flush(point));
  }

  private flush(point: NormalizedPoint): void {
    this.send({
      type: 'scroll',
      input: { x: point.x, y: point.y, scrollX: this.accumulatedX, scrollY: -this.accumulatedY },
    });
    this.accumulatedX = 0;
    this.accumulatedY = 0;
  }
}
