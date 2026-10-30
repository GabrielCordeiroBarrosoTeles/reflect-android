import type { DeviceFrame } from './protocol';

export const GENERIC_FRAME: DeviceFrame = { screenCornerRadius: 0.075, bezel: 0.027, chin: 0 };

export const isGenericFrame = (frame: DeviceFrame): boolean =>
  frame.screenCornerRadius === GENERIC_FRAME.screenCornerRadius && frame.bezel === GENERIC_FRAME.bezel && frame.chin === GENERIC_FRAME.chin;
