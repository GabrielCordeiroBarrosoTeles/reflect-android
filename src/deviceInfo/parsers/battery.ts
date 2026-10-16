import type { BatteryInfo, BatteryStatus, PowerSource } from '../types';
import { keyValues, toNumber } from './sections';

const STATUSES: Readonly<Record<string, BatteryStatus>> = {
  '2': 'charging',
  '3': 'discharging',
  '4': 'notCharging',
  '5': 'full',
};

const POWER_SOURCES: readonly (readonly [string, PowerSource])[] = [
  ['AC powered', 'ac'],
  ['USB powered', 'usb'],
  ['Wireless powered', 'wireless'],
];

export const parseBattery = (text: string): BatteryInfo | undefined => {
  const values = keyValues(text);
  const level = toNumber(values.get('level'));
  if (level === undefined) {
    return undefined;
  }
  const scale = toNumber(values.get('scale')) ?? 100;
  const powered = POWER_SOURCES.find(([key]) => values.get(key) === 'true');
  return {
    levelPercent: Math.round((level / scale) * 100),
    status: STATUSES[values.get('status') ?? ''] ?? 'unknown',
    temperatureCelsius: (toNumber(values.get('temperature')) ?? 0) / 10,
    powerSource: powered ? powered[1] : 'battery',
  };
};
