import { AndroidKeyCode, AndroidKeyEventMeta } from '@yume-chan/scrcpy';
import type { KeyModifiers } from '../shared/protocol';

const KEY_CODES: Readonly<Record<string, AndroidKeyCode>> = AndroidKeyCode;

const MODIFIER_CODES = new Set(['ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight']);

export const toAndroidKeyCode = (code: string): AndroidKeyCode | undefined =>
  MODIFIER_CODES.has(code) ? undefined : KEY_CODES[code];

export const toAndroidMetaState = (modifiers: KeyModifiers): AndroidKeyEventMeta => {
  let meta: number = AndroidKeyEventMeta.None;
  if (modifiers.shift) {
    meta |= AndroidKeyEventMeta.Shift | AndroidKeyEventMeta.ShiftLeft;
  }
  if (modifiers.alt) {
    meta |= AndroidKeyEventMeta.Alt | AndroidKeyEventMeta.AltLeft;
  }
  if (modifiers.ctrl || modifiers.meta) {
    meta |= AndroidKeyEventMeta.Ctrl | AndroidKeyEventMeta.CtrlLeft;
  }
  return meta as AndroidKeyEventMeta;
};
