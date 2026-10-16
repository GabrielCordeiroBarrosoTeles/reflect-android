import { AndroidKeyCode, AndroidKeyEventMeta } from '@yume-chan/scrcpy';
import { describe, expect, it } from 'vitest';
import { toAndroidKeyCode, toAndroidMetaState } from '../../src/scrcpy/keyMapping';

const none = { shift: false, alt: false, ctrl: false, meta: false };

describe('toAndroidKeyCode', () => {
  it('maps KeyboardEvent.code names directly', () => {
    expect(toAndroidKeyCode('KeyA')).toBe(AndroidKeyCode.KeyA);
    expect(toAndroidKeyCode('Backspace')).toBe(AndroidKeyCode.Backspace);
    expect(toAndroidKeyCode('ArrowLeft')).toBe(AndroidKeyCode.ArrowLeft);
  });

  it('ignores modifier keys and unknown codes', () => {
    expect(toAndroidKeyCode('ShiftLeft')).toBeUndefined();
    expect(toAndroidKeyCode('MetaRight')).toBeUndefined();
    expect(toAndroidKeyCode('NotAKey')).toBeUndefined();
  });
});

describe('toAndroidMetaState', () => {
  it('returns none without modifiers', () => {
    expect(toAndroidMetaState(none)).toBe(AndroidKeyEventMeta.None);
  });

  it.each([
    [{ ...none, shift: true }, AndroidKeyEventMeta.Shift | AndroidKeyEventMeta.ShiftLeft],
    [{ ...none, alt: true }, AndroidKeyEventMeta.Alt | AndroidKeyEventMeta.AltLeft],
    [{ ...none, ctrl: true }, AndroidKeyEventMeta.Ctrl | AndroidKeyEventMeta.CtrlLeft],
    [{ ...none, meta: true }, AndroidKeyEventMeta.Ctrl | AndroidKeyEventMeta.CtrlLeft],
  ])('maps %j', (modifiers, expected) => {
    expect(toAndroidMetaState(modifiers)).toBe(expected);
  });
});
