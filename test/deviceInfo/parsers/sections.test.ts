import { describe, expect, it } from 'vitest';
import { keyValues, splitSections, toNumber } from '../../../src/deviceInfo/parsers/sections';

describe('splitSections', () => {
  it('splits output by @@ markers and ignores text before the first marker', () => {
    const sections = splitSections('noise\r\n@@one\r\na\r\nb\n@@two\n\nc\n');
    expect([...sections]).toEqual([
      ['one', 'a\nb'],
      ['two', 'c'],
    ]);
  });
});

describe('keyValues', () => {
  it('reads "key: value" lines and skips the rest', () => {
    expect([...keyValues('  level: 79\nno separator\n: empty key\nkey: a: b')]).toEqual([
      ['level', '79'],
      ['key', 'a: b'],
    ]);
  });
});

describe('toNumber', () => {
  it.each([
    ['42', 42],
    [' 3.5 ', 3.5],
    ['', undefined],
    [undefined, undefined],
    ['abc', undefined],
  ])('converts %j', (value, expected) => {
    expect(toNumber(value)).toBe(expected);
  });
});
