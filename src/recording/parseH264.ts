import { h264ParseConfiguration } from '@yume-chan/scrcpy';
import type { H264Info } from './types';

const hex = (value: number): string => value.toString(16).padStart(2, '0');

export const parseH264 = (configuration: Uint8Array): H264Info => {
  const { profileIndex, constraintSet, levelIndex, croppedWidth, croppedHeight } = h264ParseConfiguration(configuration);
  return { codec: `avc1.${hex(profileIndex)}${hex(constraintSet)}${hex(levelIndex)}`, width: croppedWidth, height: croppedHeight };
};
