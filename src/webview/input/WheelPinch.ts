import type { TouchAction } from '../../shared/protocol';
import type { FrameScheduler } from './FrameScheduler';
import type { Disposable, MessageSink, NormalizedPoint } from './types';

const PINCH_TASK = 'wheel-pinch';
const INITIAL_SPAN = 0.12;
const MIN_SPAN = 0.02;
const MAX_SPAN = 0.9;
const PIXELS_PER_ZOOM_STEP = 120;
const MAX_STEP_PIXELS = 120;
const SMOOTHING = 0.35;
const SETTLE_DISTANCE = 0.0005;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const clampSpan = (value: number): number => Math.min(MAX_SPAN, Math.max(MIN_SPAN, value));

const clampStep = (value: number): number => Math.min(MAX_STEP_PIXELS, Math.max(-MAX_STEP_PIXELS, value));

interface PinchGesture {
  readonly center: NormalizedPoint;
  current: number;
  target: number;
}

export class WheelPinch implements Disposable {
  private gesture: PinchGesture | undefined;
  private releaseTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly scheduler: FrameScheduler,
    private readonly send: MessageSink,
    private readonly idleMs = 400,
  ) {}

  zoom(center: NormalizedPoint, deltaPixels: number): void {
    const gesture = this.gesture ?? this.begin(center);
    gesture.target = clampSpan(gesture.target * Math.exp(-clampStep(deltaPixels) / PIXELS_PER_ZOOM_STEP));
    this.scheduler.schedule(PINCH_TASK, () => this.animate(gesture));
    clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => this.end('up'), this.idleMs);
  }

  dispose(): void {
    this.end('cancel');
  }

  private begin(center: NormalizedPoint): PinchGesture {
    const gesture: PinchGesture = { center, current: INITIAL_SPAN, target: INITIAL_SPAN };
    this.gesture = gesture;
    this.sendFingers('down', gesture.center, gesture.current);
    return gesture;
  }

  private animate(gesture: PinchGesture): void {
    if (gesture !== this.gesture) {
      return;
    }
    const remaining = gesture.target - gesture.current;
    gesture.current = Math.abs(remaining) < SETTLE_DISTANCE ? gesture.target : gesture.current + remaining * SMOOTHING;
    this.sendFingers('move', gesture.center, gesture.current);
    if (gesture.current !== gesture.target) {
      this.scheduler.schedule(PINCH_TASK, () => this.animate(gesture));
    }
  }

  private end(action: 'up' | 'cancel'): void {
    clearTimeout(this.releaseTimer);
    this.releaseTimer = undefined;
    const gesture = this.gesture;
    if (!gesture) {
      return;
    }
    this.gesture = undefined;
    this.sendFingers('move', gesture.center, gesture.target);
    this.sendFingers(action, gesture.center, gesture.target);
  }

  private sendFingers(action: TouchAction, center: NormalizedPoint, span: number): void {
    const offset = span / 2;
    this.send({
      type: 'touch',
      input: { action, pointer: 'primary', x: clampUnit(center.x + offset), y: clampUnit(center.y + offset) },
    });
    this.send({
      type: 'touch',
      input: { action, pointer: 'virtual', x: clampUnit(center.x - offset), y: clampUnit(center.y - offset) },
    });
  }
}
