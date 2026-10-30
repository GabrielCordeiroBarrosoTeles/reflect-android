import type { HardwareButton, IDeviceControl } from '../platform/types';
import type { KeyInput, KeyModifiers, ScrollInput, TouchInput } from '../shared/protocol';
import type { Keystroke } from './hidUsages';
import { META_USAGE, OPTION_USAGE, R_USAGE, SHIFT_USAGE, V_USAGE, charToKeystrokes, modifierUsages, toHidUsage } from './hidUsages';
import type { HelperCommand, HelperHello, ISimulatorPasteboard } from './types';

const WHEEL_POINTS = 40;
const SCROLL_INTERVAL_MS = 100;
const PASTE_SETTLE_MS = 300;
const PRIMARY_TOUCH_ID = 1;

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

const MODIFIER_FLAGS: readonly (keyof KeyModifiers)[] = ['meta', 'ctrl', 'alt', 'shift'];

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
  private queue: Promise<void> = Promise.resolve();
  private readonly heldUsages = new Set<number>();
  private readonly addedModifiers = new Map<string, readonly number[]>();

  constructor(
    private readonly send: (command: HelperCommand) => void,
    private readonly hello: HelperHello,
    private readonly pasteboard: ISimulatorPasteboard,
    private readonly timers: ScrollTimers,
  ) {}

  touch(input: TouchInput): Promise<void> {
    if (input.pointer === 'virtual') {
      return Promise.resolve();
    }
    const { pointWidth, pointHeight } = this.hello.device;
    this.send({
      type: 'touch',
      phase: input.action === 'cancel' ? 'up' : input.action,
      x: input.x * pointWidth,
      y: input.y * pointHeight,
      id: PRIMARY_TOUCH_ID,
    });
    return Promise.resolve();
  }

  scroll(input: ScrollInput): Promise<void> {
    const { pointWidth, pointHeight } = this.hello.device;
    const fingerDx = -input.scrollX * WHEEL_POINTS;
    const fingerDy = input.scrollY * WHEEL_POINTS;
    const pending = this.pendingScroll;
    if (pending) {
      pending.dx += fingerDx;
      pending.dy += fingerDy;
      return Promise.resolve();
    }
    const batch = { x: input.x * pointWidth, y: input.y * pointHeight, dx: fingerDx, dy: fingerDy };
    this.pendingScroll = batch;
    this.timers.setTimeout(() => this.flushScroll(batch), SCROLL_INTERVAL_MS);
    return Promise.resolve();
  }

  key(input: KeyInput): Promise<void> {
    return this.enqueue(() => this.sendKey(input));
  }

  text(text: string): Promise<void> {
    return this.enqueue(async () => {
      const sequences = Array.from(text, charToKeystrokes);
      if (sequences.every((sequence) => sequence !== undefined)) {
        sequences.flat().forEach((keystroke) => this.type(keystroke));
        return;
      }
      await this.pasteboard.lend(text, () => this.pressPaste());
    });
  }

  paste(text: string): Promise<void> {
    return this.enqueue(() => this.pasteboard.push(text, () => this.pressPaste()));
  }

  reloadShortcut(): Promise<void> {
    return this.enqueue(() => this.chord(META_USAGE, R_USAGE));
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

  private enqueue(task: () => Promise<void> | void): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private sendKey(input: KeyInput): void {
    const usage = toHidUsage(input.code);
    if (usage === undefined) {
      return;
    }
    if (input.action === 'down') {
      this.pressWithModifiers(input, usage);
      return;
    }
    this.release(usage);
    const added = this.addedModifiers.get(input.code) ?? [];
    this.addedModifiers.delete(input.code);
    [...added].reverse().forEach((modifier) => this.release(modifier));
  }

  private pressWithModifiers(input: KeyInput, usage: number): void {
    const missing = MODIFIER_FLAGS.filter((flag) => input.modifiers[flag])
      .map(modifierUsages)
      .filter((usages) => !usages.includes(usage) && !usages.some((candidate) => this.heldUsages.has(candidate)))
      .map(([left]) => left as number);
    missing.forEach((modifier) => this.press(modifier));
    if (missing.length > 0) {
      this.addedModifiers.set(input.code, missing);
    }
    this.press(usage);
  }

  private press(usage: number): void {
    this.heldUsages.add(usage);
    this.send({ type: 'key', usage, down: true });
  }

  private release(usage: number): void {
    this.heldUsages.delete(usage);
    this.send({ type: 'key', usage, down: false });
  }

  private async pressPaste(): Promise<void> {
    this.chord(META_USAGE, V_USAGE);
    await new Promise<void>((resolve) => this.timers.setTimeout(resolve, PASTE_SETTLE_MS));
  }

  private chord(modifier: number, usage: number): void {
    this.send({ type: 'key', usage: modifier, down: true });
    this.tap(usage);
    this.send({ type: 'key', usage: modifier, down: false });
  }

  private flushScroll(batch: PendingScroll): void {
    this.pendingScroll = undefined;
    this.send({ type: 'scroll', ...batch });
  }

  private type({ usage, shift, option }: Keystroke): void {
    const modifiers = [...(option ? [OPTION_USAGE] : []), ...(shift ? [SHIFT_USAGE] : [])];
    modifiers.forEach((modifier) => this.send({ type: 'key', usage: modifier, down: true }));
    this.tap(usage);
    [...modifiers].reverse().forEach((modifier) => this.send({ type: 'key', usage: modifier, down: false }));
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
