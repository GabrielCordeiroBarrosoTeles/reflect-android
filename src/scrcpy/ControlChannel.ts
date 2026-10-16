import type { ScrcpyControlMessageWriter } from '@yume-chan/scrcpy';
import {
  AndroidKeyCode,
  AndroidKeyEventAction,
  AndroidKeyEventMeta,
  AndroidMotionEventAction,
  AndroidMotionEventButton,
  AndroidScreenPowerMode,
  ScrcpyPointerId,
} from '@yume-chan/scrcpy';
import type { KeyInput, PointerKind, ScrollInput, TouchAction, TouchInput } from '../shared/protocol';
import { toAndroidKeyCode, toAndroidMetaState } from './keyMapping';
import type { IDeviceControl, VideoSize } from './types';

const TOUCH_ACTIONS: Readonly<Record<TouchAction, AndroidMotionEventAction>> = {
  down: AndroidMotionEventAction.Down,
  move: AndroidMotionEventAction.Move,
  up: AndroidMotionEventAction.Up,
  cancel: AndroidMotionEventAction.Cancel,
};

const POINTER_IDS: Readonly<Record<PointerKind, bigint>> = {
  primary: ScrcpyPointerId.Finger,
  virtual: ScrcpyPointerId.VirtualFinger,
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const clampScroll = (value: number): number => Math.min(1, Math.max(-1, value));

export class ControlChannel implements IDeviceControl {
  constructor(
    private readonly getWriter: () => ScrcpyControlMessageWriter | undefined,
    private readonly getVideoSize: () => VideoSize | undefined,
  ) {}

  async touch(input: TouchInput): Promise<void> {
    const writer = this.getWriter();
    const size = this.getVideoSize();
    if (!writer || !size) {
      return;
    }
    const isRelease = input.action === 'up' || input.action === 'cancel';
    await writer.injectTouch({
      action: TOUCH_ACTIONS[input.action],
      pointerId: POINTER_IDS[input.pointer],
      pointerX: Math.round(clampUnit(input.x) * size.width),
      pointerY: Math.round(clampUnit(input.y) * size.height),
      videoWidth: size.width,
      videoHeight: size.height,
      pressure: isRelease ? 0 : 1,
      actionButton: AndroidMotionEventButton.None,
      buttons: AndroidMotionEventButton.None,
    });
  }

  async scroll(input: ScrollInput): Promise<void> {
    const writer = this.getWriter();
    const size = this.getVideoSize();
    if (!writer || !size) {
      return;
    }
    await writer.injectScroll({
      pointerX: Math.round(clampUnit(input.x) * size.width),
      pointerY: Math.round(clampUnit(input.y) * size.height),
      videoWidth: size.width,
      videoHeight: size.height,
      scrollX: clampScroll(input.scrollX),
      scrollY: clampScroll(input.scrollY),
      buttons: AndroidMotionEventButton.None,
    });
  }

  async key(input: KeyInput): Promise<void> {
    const writer = this.getWriter();
    const keyCode = toAndroidKeyCode(input.code);
    if (!writer || keyCode === undefined) {
      return;
    }
    await writer.injectKeyCode({
      action: input.action === 'down' ? AndroidKeyEventAction.Down : AndroidKeyEventAction.Up,
      keyCode,
      repeat: input.repeat,
      metaState: toAndroidMetaState(input.modifiers),
    });
  }

  async press(keyCode: AndroidKeyCode): Promise<void> {
    const writer = this.getWriter();
    if (!writer) {
      return;
    }
    for (const action of [AndroidKeyEventAction.Down, AndroidKeyEventAction.Up]) {
      await writer.injectKeyCode({ action, keyCode, repeat: 0, metaState: AndroidKeyEventMeta.None });
    }
  }

  async text(text: string): Promise<void> {
    await this.getWriter()?.injectText(text);
  }

  async back(): Promise<void> {
    const writer = this.getWriter();
    if (!writer) {
      return;
    }
    await writer.backOrScreenOn(AndroidKeyEventAction.Down);
    await writer.backOrScreenOn(AndroidKeyEventAction.Up);
  }

  async home(): Promise<void> {
    await this.press(AndroidKeyCode.AndroidHome);
  }

  async recents(): Promise<void> {
    await this.press(AndroidKeyCode.AndroidAppSwitch);
  }

  async rotate(): Promise<void> {
    await this.getWriter()?.rotateDevice();
  }

  async setScreenPower(on: boolean): Promise<void> {
    await this.getWriter()?.setScreenPowerMode(on ? AndroidScreenPowerMode.Normal : AndroidScreenPowerMode.Off);
  }

  async paste(text: string): Promise<void> {
    await this.getWriter()?.setClipboard({ sequence: 0n, paste: true, content: text });
  }
}
