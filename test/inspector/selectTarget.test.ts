import { describe, expect, it } from 'vitest';
import { selectTarget } from '../../src/inspector/selectTarget';
import type { MetroTarget } from '../../src/inspector/types';
import { device } from '../fakes/devices';

const target = (deviceName: string, title = 'host.exp.exponent'): MetroTarget => ({ id: deviceName, title, deviceName, webSocketDebuggerUrl: `ws://${deviceName}` });

describe('selectTarget', () => {
  it('matches the device model ignoring punctuation and case', () => {
    const targets = [target('Pixel 8 - 15 - API 35'), target('SM-F741B - 16 - API 36')];
    expect(selectTarget(targets, device({ model: 'SM F741B' }))).toBe(targets[1]);
  });

  it('matches the model in the title too', () => {
    const targets = [target('emulator', 'app (samsung SM-F741B)'), target('other')];
    expect(selectTarget(targets, device({ model: 'SM F741B' }))).toBe(targets[0]);
  });

  it('falls back to the only target when the model does not match', () => {
    const only = target('Something else');
    expect(selectTarget([only], device({ model: 'SM F741B' }))).toBe(only);
    expect(selectTarget([only], device({ model: undefined }))).toBe(only);
  });

  it('returns undefined when several targets do not match', () => {
    expect(selectTarget([target('a'), target('b')], device({ model: 'SM F741B' }))).toBeUndefined();
    expect(selectTarget([], device())).toBeUndefined();
  });
});
