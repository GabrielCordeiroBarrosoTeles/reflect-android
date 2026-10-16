import type { TouchAction } from '../../shared/protocol';
import type { CanvasPointMapper } from './CanvasPointMapper';
import { mirrorAround, pinchCenterFor } from './coordinates';
import type { FrameScheduler } from './FrameScheduler';
import type { Disposable, InspectModeState, MessageSink, NormalizedPoint } from './types';

const MOVE_TASK = 'pointer-move';

const MouseButton = {
  Primary: 0,
  Middle: 1,
  Secondary: 2,
} as const;

export class PointerInput implements Disposable {
  private activePointerId: number | undefined;
  private pinchCenter: NormalizedPoint | undefined;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mapper: CanvasPointMapper,
    private readonly scheduler: FrameScheduler,
    private readonly send: MessageSink,
    private readonly inspectMode: InspectModeState,
  ) {
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', (event) => this.handleDown(event), options);
    canvas.addEventListener('pointermove', (event) => this.handleMove(event), options);
    canvas.addEventListener('pointerup', (event) => this.handleRelease(event, 'up'), options);
    canvas.addEventListener('pointercancel', (event) => this.handleRelease(event, 'cancel'), options);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault(), options);
  }

  dispose(): void {
    this.abort.abort();
  }

  private handleDown(event: PointerEvent): void {
    this.canvas.focus();
    if (event.button === MouseButton.Secondary) {
      event.preventDefault();
      this.send({ type: 'mouse-shortcut', shortcut: 'back' });
      return;
    }
    if (event.button === MouseButton.Middle) {
      event.preventDefault();
      this.send({ type: 'mouse-shortcut', shortcut: 'home' });
      return;
    }
    if (event.button !== MouseButton.Primary || this.activePointerId !== undefined) {
      return;
    }
    const point = this.mapper.map(event);
    if (!point.inside) {
      return;
    }
    event.preventDefault();
    if (this.inspectMode.active) {
      this.send({ type: 'inspect-at', x: point.x, y: point.y });
      return;
    }
    this.canvas.setPointerCapture(event.pointerId);
    this.activePointerId = event.pointerId;
    this.pinchCenter = event.altKey ? pinchCenterFor(point) : undefined;
    this.sendTouch('down', point);
  }

  private handleMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    const point = this.mapper.map(event);
    this.scheduler.schedule(MOVE_TASK, () => this.sendTouch('move', point));
  }

  private handleRelease(event: PointerEvent, action: 'up' | 'cancel'): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }
    this.scheduler.flushNow(MOVE_TASK);
    this.sendTouch(action, this.mapper.map(event));
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    this.activePointerId = undefined;
    this.pinchCenter = undefined;
  }

  private sendTouch(action: TouchAction, point: NormalizedPoint): void {
    this.send({ type: 'touch', input: { action, pointer: 'primary', x: point.x, y: point.y } });
    if (this.pinchCenter) {
      const mirrored = mirrorAround(point, this.pinchCenter);
      this.send({ type: 'touch', input: { action, pointer: 'virtual', x: mirrored.x, y: mirrored.y } });
    }
  }
}
