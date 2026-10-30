import { describe, expect, it } from 'vitest';
import { charToKeystroke, charToKeystrokes, toHidUsage } from '../../src/ios/hidUsages';

describe('toHidUsage', () => {
  it.each([
    ['KeyA', 4],
    ['KeyZ', 29],
    ['Digit1', 30],
    ['Digit0', 39],
    ['Enter', 40],
    ['Escape', 41],
    ['Backspace', 42],
    ['Tab', 43],
    ['Space', 44],
    ['Minus', 45],
    ['Slash', 56],
    ['F1', 58],
    ['F12', 69],
    ['Delete', 76],
    ['ArrowRight', 79],
    ['ArrowUp', 82],
    ['ShiftLeft', 225],
    ['MetaLeft', 227],
  ])('maps %s to %i', (code, usage) => {
    expect(toHidUsage(code)).toBe(usage);
  });

  it.each(['F13', 'F0', 'Unknown', 'KeyAA', 'Numpad1', ''])('has no usage for %s', (code) => {
    expect(toHidUsage(code)).toBeUndefined();
  });
});

describe('charToKeystroke', () => {
  it.each([
    ['a', 4, false],
    ['A', 4, true],
    ['z', 29, false],
    ['1', 30, false],
    ['0', 39, false],
    ['!', 30, true],
    [')', 39, true],
    [' ', 44, false],
    ['\n', 40, false],
    ['\t', 43, false],
    ['-', 45, false],
    ['_', 45, true],
    ['\\', 49, false],
    ['|', 49, true],
    ["'", 52, false],
    ['"', 52, true],
    ['`', 53, false],
    ['~', 53, true],
    ['/', 56, false],
    ['?', 56, true],
  ])('maps %j to usage %i (shift %s)', (char, usage, shift) => {
    expect(charToKeystroke(char)).toEqual({ usage, shift });
  });

  it.each(['á', '€', '', 'ab', '\u0001'])('cannot type %j', (char) => {
    expect(charToKeystroke(char)).toBeUndefined();
  });
});

describe('charToKeystrokes', () => {
  it.each([
    ['a', [{ usage: 4, shift: false }]],
    ['ç', [{ usage: 6, shift: false, option: true }]],
    ['Ç', [{ usage: 6, shift: true, option: true }]],
    ['á', [{ usage: 8, shift: false, option: true }, { usage: 4, shift: false }]],
    ['à', [{ usage: 53, shift: false, option: true }, { usage: 4, shift: false }]],
    ['ê', [{ usage: 12, shift: false, option: true }, { usage: 8, shift: false }]],
    ['ã', [{ usage: 17, shift: false, option: true }, { usage: 4, shift: false }]],
    ['Õ', [{ usage: 17, shift: false, option: true }, { usage: 18, shift: true }]],
    ['ñ', [{ usage: 17, shift: false, option: true }, { usage: 17, shift: false }]],
    ['ü', [{ usage: 24, shift: false, option: true }, { usage: 24, shift: false }]],
  ])('types %s', (char, keystrokes) => {
    expect(charToKeystrokes(char)).toEqual(keystrokes);
  });

  it.each(['ẽ', 'ǘ', '中', '😀', 'ŝ'])('has no keyboard sequence for %s', (char) => {
    expect(charToKeystrokes(char)).toBeUndefined();
  });
});
