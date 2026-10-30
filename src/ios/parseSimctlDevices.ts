import type { Device } from '../devices/types';

const IOS_RUNTIME_PREFIX = 'com.apple.CoreSimulator.SimRuntime.iOS-';

type Entry = Record<string, unknown>;

const isRecord = (value: unknown): value is Entry => typeof value === 'object' && value !== null && !Array.isArray(value);

const runtimeLabel = (runtime: string): string => `iOS ${runtime.slice(IOS_RUNTIME_PREFIX.length).replaceAll('-', '.')}`;

const TRANSITIONAL_STATES: Readonly<Record<string, string | undefined>> = {
  Booting: 'booting',
  'Shutting Down': 'shutting down',
};

const toState = (state: unknown): Device['state'] => {
  if (state === 'Booted') {
    return 'ready';
  }
  return typeof state === 'string' && TRANSITIONAL_STATES[state] !== undefined ? 'offline' : 'shutdown';
};

const toDetail = (runtime: string, state: unknown): string => {
  const transition = typeof state === 'string' ? TRANSITIONAL_STATES[state] : undefined;
  return transition === undefined ? runtime : `${runtime} · ${transition}`;
};

const isAvailable = (entry: Entry): boolean => entry['isAvailable'] === true || entry['availability'] === '(available)';

const toDevice = (entry: unknown, detail: string): Device | undefined => {
  if (!isRecord(entry) || typeof entry['udid'] !== 'string' || typeof entry['name'] !== 'string' || !isAvailable(entry)) {
    return undefined;
  }
  return {
    id: entry['udid'],
    platform: 'ios',
    kind: 'simulator',
    name: entry['name'],
    model: entry['name'],
    detail: toDetail(detail, entry['state']),
    state: toState(entry['state']),
  };
};

const rank = (device: Device): number => (device.state === 'ready' ? 0 : 1);

export const parseSimctlDevices = (json: string): readonly Device[] => {
  const root: unknown = JSON.parse(json);
  const runtimes = isRecord(root) && isRecord(root['devices']) ? root['devices'] : {};
  return Object.entries(runtimes)
    .filter(([runtime, entries]) => runtime.startsWith(IOS_RUNTIME_PREFIX) && Array.isArray(entries))
    .flatMap(([runtime, entries]) => (entries as unknown[]).map((entry) => toDevice(entry, runtimeLabel(runtime))))
    .filter((device): device is Device => device !== undefined)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};
