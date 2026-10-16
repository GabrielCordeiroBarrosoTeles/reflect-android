import { describe, expect, it } from 'vitest';
import { parseH264 } from '../../src/recording/parseH264';
import { DEVICE_CONFIGURATION } from '../fakes/h264';

describe('parseH264', () => {
  it('builds the codec string and size from a real device configuration', () => {
    expect(parseH264(DEVICE_CONFIGURATION)).toEqual({ codec: 'avc1.64002a', width: 784, height: 1920 });
  });
});
