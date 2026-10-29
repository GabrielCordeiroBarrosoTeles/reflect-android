import type { Device } from '../devices/types';
import type { MetroTarget } from './types';

const normalize = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

export const selectTarget = (targets: readonly MetroTarget[], device: Device): MetroTarget | undefined => {
  const model = normalize(device.model ?? '');
  const matching = model
    ? targets.find((target) => normalize(`${target.deviceName} ${target.title}`).includes(model))
    : undefined;
  return matching ?? (targets.length === 1 ? targets[0] : undefined);
};
