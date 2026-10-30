import type { HardwareButton, IDeviceControl } from '../platform/types';
import type { KeyInput, ScrollInput, TouchInput } from '../shared/protocol';
import { META_USAGE, SHIFT_USAGE, V_USAGE, charToKeystroke, toHidUsage } from './hidUsages';
import type { HelperCommand, HelperHello, ISimctl } from './types';

const WHEEL_POINTS = 40;
const SCROLL_INTERVAL_MS = 100;
const PRIMARY_TOUCH_ID = 1;
const VIRTUAL_TOUCH_ID = 2;

const BUTTON_NAMES: Readonly<Record<HardwareButton, string | undefined>> = {
  back: undefined,
  home: 'home',
  recents: 'appSwitcher',
  menu: 'shake',
  shake: 'shake',
  lock: 'lock',
  volumeUp: 'volumeUp',
  volumeDown: 'volumeDown',
  siri: 'siri',
};

export interface ScrollTimers {
  setTimeout(callback: () => void, delayMs: number): unknown;
}

interface PendingScroll {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export class IosDeviceControl implements IDeviceControl {
  private pendingScroll: PendingScroll | undefined;

  constructor(
    private readonly send: (command: HelperCommand) => void,
    private readonly hello: HelperHello,
    private readonly simctl: ISimctl,
    private readonly udid: string,
    private readonly timers: ScrollTimers,
  ) {}

  touch(input: TouchInput): Promise<void> {
    const { pointWidth, pointHeight } = this.hello.device;
    this.send({
      type: 'touch',
      phase: input.action === 'cancel' ? 'up' : input.action,
      x: input.x * pointWidth,
      y: input.y * pointHeight,
      id: input.pointer === 'virtual' ? VIRTUAL_TOUCH_ID : PRIMARY_TOUCH_ID,
    });
    return Promise.resolve();
  }

  /** Wheel input is coalesced: each helper scroll is a ~110 ms drag, and iOS adds momentum on lift. */
  scroll(input: ScrollInput): Promise<void> {
    const { pointWidth, pointHeight } = this.hello.device;
    // ScrollInput follows scrcpy: +y reveals content above (finger moves down), +x reveals content to the right (finger moves left).
    const dx = -input.scrollX * WHEEL_POINTS;
    const dy = input.scrollY * WHEEL_POINTS;
    const pending = this.pendingScroll;
    if (pending) {
      pending.dx += dx;
      pending.dy += dy;
      return Promise.resolve();
    }
    const batch = { x: input.x * pointWidth, y: input.y * pointHeight, dx, dy };
    this.pendingScroll = batch;
    this.timers.setTimeout(() => this.flushScroll(batch), SCROLL_INTERVAL_MS);
    return Promise.resolve();
  }

  key(input: KeyInput): Promise<void> {
    const usage = toHidUsage(input.code);
    if (usage !== undefined) {
      this.send({ type: 'key', usage, down: input.action === 'down' });
    }
    return Promise.resolve();
  }

  async text(text: string): Promise<void> {
    const keystrokes = Array.from(text, charToKeystroke);
    if (keystrokes.every((keystroke) => keystroke !== undefined)) {
      keystrokes.forEach((keystroke) => this.type(keystroke.usage, keystroke.shift));
      return;
    }
    await this.paste(text);
  }

  async paste(text: string): Promise<void> {
    await this.simctl.run(['pbcopy', this.udid], text);
    this.send({ type: 'key', usage: META_USAGE, down: true });
    this.tap(V_USAGE);
    this.send({ type: 'key', usage: META_USAGE, down: false });
  }

  pressButton(button: HardwareButton): Promise<void> {
    const name = BUTTON_NAMES[button];
    if (name !== undefined) {
      this.tapButton(name);
    }
    return Promise.resolve();
  }

  rotate(): Promise<void> {
    this.send({ type: 'rotate' });
    return Promise.resolve();
  }

  setScreenPower(on: boolean): Promise<void> {
    this.tapButton(on ? 'home' : 'lock');
    return Promise.resolve();
  }

  private flushScroll(batch: PendingScroll): void {
    this.pendingScroll = undefined;
    this.send({ type: 'scroll', ...batch });
  }

  private type(usage: number, shift: boolean): void {
    if (shift) {
      this.send({ type: 'key', usage: SHIFT_USAGE, down: true });
    }
    this.tap(usage);
    if (shift) {
      this.send({ type: 'key', usage: SHIFT_USAGE, down: false });
    }
  }

  private tap(usage: number): void {
    this.send({ type: 'key', usage, down: true });
    this.send({ type: 'key', usage, down: false });
  }

  private tapButton(name: string): void {
    this.send({ type: 'button', name, down: true });
    this.send({ type: 'button', name, down: false });
  }
}
