import type { Device } from '../devices/types';
import type { MetroTarget } from './types';

const EXACT = 2;
const PARTIAL = 1;
const NONE = 0;

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const deviceNames = (device: Device): readonly string[] => [device.name, device.model ?? ''].map(normalize).filter((name) => name !== '');

const rank = (target: MetroTarget, names: readonly string[]): number => {
  const deviceName = normalize(target.deviceName);
  if (names.includes(deviceName)) {
    return EXACT;
  }
  const label = normalize(`${target.deviceName} ${target.title}`);
  return names.some((name) => label.includes(name)) ? PARTIAL : NONE;
};

export const selectTarget = (targets: readonly MetroTarget[], device: Device): MetroTarget | undefined => {
  const names = deviceNames(device);
  const best = targets.reduce<{ target: MetroTarget | undefined; rank: number }>(
    (current, target) => {
      const score = rank(target, names);
      return score > current.rank ? { target, rank: score } : current;
    },
    { target: undefined, rank: NONE },
  );
  return best.target ?? (targets.length === 1 ? targets[0] : undefined);
};
