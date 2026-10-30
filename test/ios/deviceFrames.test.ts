import { describe, expect, it } from 'vitest';
import { frameForModel } from '../../src/ios/deviceFrames';
import { GENERIC_FRAME } from '../../src/shared/deviceFrame';

const round = (value: number) => Math.round(value * 10000) / 10000;

describe('frameForModel', () => {
  it('derives the iPhone 15 corner radius from 55pt over a 393pt screen', () => {
    expect(frameForModel('iPhone 15')).toEqual({ screenCornerRadius: round(55 / 393), bezel: 0.04, chin: 0 });
  });

  it.each([
    ['iPhone X', 39, 375],
    ['iPhone XS', 39, 375],
    ['iPhone XS Max', 39, 414],
    ['iPhone 11 Pro', 39, 375],
    ['iPhone 11 Pro Max', 39, 414],
    ['iPhone XR', 41.5, 414],
    ['iPhone 11', 41.5, 414],
    ['iPhone 12 mini', 44, 375],
    ['iPhone 13 mini', 44, 375],
    ['iPhone 12', 47.33, 390],
    ['iPhone 12 Pro', 47.33, 390],
    ['iPhone 13', 47.33, 390],
    ['iPhone 13 Pro', 47.33, 390],
    ['iPhone 14', 47.33, 390],
    ['iPhone 16e', 47.33, 390],
    ['iPhone 12 Pro Max', 53.33, 428],
    ['iPhone 13 Pro Max', 53.33, 428],
    ['iPhone 14 Plus', 53.33, 428],
    ['iPhone 14 Pro', 55, 393],
    ['iPhone 15 Pro', 55, 393],
    ['iPhone 16', 55, 393],
    ['iPhone 14 Pro Max', 55, 430],
    ['iPhone 15 Plus', 55, 430],
    ['iPhone 15 Pro Max', 55, 430],
    ['iPhone 16 Plus', 55, 430],
    ['iPhone 16 Pro', 62, 402],
    ['iPhone 16 Pro Max', 62, 440],
    ['iPhone 17', 62, 402],
    ['iPhone 17 Pro', 62, 402],
    ['iPhone 17 Pro Max', 62, 440],
    ['iPhone Air', 62, 420],
  ])('uses the display radius of %s', (name, radius, width) => {
    expect(frameForModel(name)).toEqual({ screenCornerRadius: round(radius / width), bezel: 0.04, chin: 0 });
  });

  it.each(['iPhone SE (2nd generation)', 'iPhone SE (3rd generation)', 'iPhone 8', 'iPhone 8 Plus'])('gives %s a chin for the home button', (name) => {
    expect(frameForModel(name)).toEqual({ screenCornerRadius: 0, bezel: 0.06, chin: 0.3 });
  });

  it.each(['iPad Pro 13-inch (M4)', 'iPhone 99', ''])('falls back to the generic frame for %j', (name) => {
    expect(frameForModel(name)).toBe(GENERIC_FRAME);
  });
});
