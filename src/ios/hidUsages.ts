/** DOM `KeyboardEvent.code` to USB HID keyboard usage (usage page 0x07). */

const NAMED_USAGES: Readonly<Record<string, number>> = {
  Enter: 40,
  Escape: 41,
  Backspace: 42,
  Tab: 43,
  Space: 44,
  Minus: 45,
  Equal: 46,
  BracketLeft: 47,
  BracketRight: 48,
  Backslash: 49,
  Semicolon: 51,
  Quote: 52,
  Backquote: 53,
  Comma: 54,
  Period: 55,
  Slash: 56,
  CapsLock: 57,
  Insert: 73,
  Home: 74,
  PageUp: 75,
  Delete: 76,
  End: 77,
  PageDown: 78,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82,
  ControlLeft: 224,
  ShiftLeft: 225,
  AltLeft: 226,
  MetaLeft: 227,
  ControlRight: 228,
  ShiftRight: 229,
  AltRight: 230,
  MetaRight: 231,
};

const LETTER_BASE = 4;
const DIGIT_BASE = 30;
const FUNCTION_BASE = 58;
const FUNCTION_KEYS = 12;
const DIGITS = 10;

const codeUsage = (code: string): number | undefined => {
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) {
    return LETTER_BASE + (letter[1] as string).charCodeAt(0) - 'A'.charCodeAt(0);
  }
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) {
    return DIGIT_BASE + ((Number(digit[1]) + DIGITS - 1) % DIGITS);
  }
  const fn = /^F([0-9]{1,2})$/.exec(code);
  if (fn && Number(fn[1]) >= 1 && Number(fn[1]) <= FUNCTION_KEYS) {
    return FUNCTION_BASE + Number(fn[1]) - 1;
  }
  return undefined;
};

export const toHidUsage = (code: string): number | undefined => NAMED_USAGES[code] ?? codeUsage(code);

export interface Keystroke {
  readonly usage: number;
  readonly shift: boolean;
}

const UNSHIFTED_PUNCTUATION = '-=[]\\;\'`,./';
const SHIFTED_PUNCTUATION = '_+{}|:"~<>?';
const SHIFTED_DIGITS = ')!@#$%^&*(';
const PUNCTUATION_CODES = ['Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Backquote', 'Comma', 'Period', 'Slash'];

const keystrokeFor = (code: string, shift: boolean): Keystroke => ({ usage: toHidUsage(code) as number, shift });

export const charToKeystroke = (char: string): Keystroke | undefined => {
  if (char === '\n') {
    return keystrokeFor('Enter', false);
  }
  if (char === '\t') {
    return keystrokeFor('Tab', false);
  }
  if (char === ' ') {
    return keystrokeFor('Space', false);
  }
  if (/^[a-z]$/.test(char)) {
    return keystrokeFor(`Key${char.toUpperCase()}`, false);
  }
  if (/^[A-Z]$/.test(char)) {
    return keystrokeFor(`Key${char}`, true);
  }
  if (/^[0-9]$/.test(char)) {
    return keystrokeFor(`Digit${char}`, false);
  }
  const shiftedDigit = SHIFTED_DIGITS.indexOf(char);
  if (shiftedDigit >= 0 && char.length === 1) {
    return keystrokeFor(`Digit${shiftedDigit}`, true);
  }
  const plain = UNSHIFTED_PUNCTUATION.indexOf(char);
  if (plain >= 0 && char.length === 1) {
    return keystrokeFor(PUNCTUATION_CODES[plain] as string, false);
  }
  const shifted = SHIFTED_PUNCTUATION.indexOf(char);
  if (shifted >= 0 && char.length === 1) {
    return keystrokeFor(PUNCTUATION_CODES[shifted] as string, true);
  }
  return undefined;
};

export const SHIFT_USAGE = toHidUsage('ShiftLeft') as number;
export const META_USAGE = toHidUsage('MetaLeft') as number;
export const V_USAGE = toHidUsage('KeyV') as number;
