import type { Device } from '../devices/types';

interface SimctlDevice {
  readonly udid: string;
  readonly name: string;
  readonly state: string;
  readonly isAvailable?: boolean;
}

const IOS_RUNTIME_PREFIX = 'com.apple.CoreSimulator.SimRuntime.iOS-';

const runtimeLabel = (runtime: string): string => `iOS ${runtime.slice(IOS_RUNTIME_PREFIX.length).replaceAll('-', '.')}`;

const toDevice = (device: SimctlDevice, detail: string): Device => ({
  id: device.udid,
  platform: 'ios',
  kind: 'simulator',
  name: device.name,
  model: device.name,
  detail,
  state: device.state === 'Booted' ? 'ready' : 'shutdown',
});

const rank = (device: Device): number => (device.state === 'ready' ? 0 : 1);

export const parseSimctlDevices = (json: string): readonly Device[] => {
  const runtimes = (JSON.parse(json) as { devices: Record<string, readonly SimctlDevice[]> }).devices;
  return Object.entries(runtimes)
    .filter(([runtime]) => runtime.startsWith(IOS_RUNTIME_PREFIX))
    .flatMap(([runtime, devices]) =>
      devices.filter((device) => device.isAvailable).map((device) => toDevice(device, runtimeLabel(runtime))),
    )
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};
