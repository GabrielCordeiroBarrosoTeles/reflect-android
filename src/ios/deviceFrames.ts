import { GENERIC_FRAME } from '../shared/deviceFrame';
import type { DeviceFrame } from '../shared/protocol';

interface Display {
  readonly name: RegExp;
  readonly cornerRadiusPoints: number;
  readonly widthPoints: number;
}

const FACE_ID_BEZEL = 0.04;

const DISPLAYS: readonly Display[] = [
  { name: /^iPhone (X|XS|11 Pro)$/, cornerRadiusPoints: 39, widthPoints: 375 },
  { name: /^iPhone (XS Max|11 Pro Max)$/, cornerRadiusPoints: 39, widthPoints: 414 },
  { name: /^iPhone (XR|11)$/, cornerRadiusPoints: 41.5, widthPoints: 414 },
  { name: /^iPhone 1[23] mini$/, cornerRadiusPoints: 44, widthPoints: 375 },
  { name: /^iPhone (12|12 Pro|13|13 Pro|14|16e)$/, cornerRadiusPoints: 47.33, widthPoints: 390 },
  { name: /^iPhone (12 Pro Max|13 Pro Max|14 Plus)$/, cornerRadiusPoints: 53.33, widthPoints: 428 },
  { name: /^iPhone (14 Pro|15|15 Pro|16)$/, cornerRadiusPoints: 55, widthPoints: 393 },
  { name: /^iPhone (14 Pro Max|15 Plus|15 Pro Max|16 Plus)$/, cornerRadiusPoints: 55, widthPoints: 430 },
  { name: /^iPhone (16 Pro|17|17 Pro)$/, cornerRadiusPoints: 62, widthPoints: 402 },
  { name: /^iPhone (16 Pro Max|17 Pro Max)$/, cornerRadiusPoints: 62, widthPoints: 440 },
  { name: /^iPhone Air$/, cornerRadiusPoints: 62, widthPoints: 420 },
];

const HOME_BUTTON_NAME = /^iPhone (SE|8)\b/;
const HOME_BUTTON_FRAME: DeviceFrame = { screenCornerRadius: 0, bezel: 0.06, chin: 0.3 };

const round = (value: number): number => Math.round(value * 10000) / 10000;

export const frameForModel = (name: string): DeviceFrame => {
  if (HOME_BUTTON_NAME.test(name)) {
    return HOME_BUTTON_FRAME;
  }
  const display = DISPLAYS.find((candidate) => candidate.name.test(name));
  if (!display) {
    return GENERIC_FRAME;
  }
  return { screenCornerRadius: round(display.cornerRadiusPoints / display.widthPoints), bezel: FACE_ID_BEZEL, chin: 0 };
};
