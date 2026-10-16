import type { BatteryInfo, BatteryStatus, DeviceSnapshot, FormatOptions, InfoEntry, InfoGroup, PowerSource } from './types';

const STATUS_LABELS: Readonly<Record<BatteryStatus, string>> = {
  charging: 'Charging',
  discharging: 'Discharging',
  notCharging: 'Not charging',
  full: 'Full',
  unknown: 'Unknown',
};

const SOURCE_LABELS: Readonly<Record<PowerSource, string>> = {
  ac: 'AC',
  usb: 'USB',
  wireless: 'Wireless',
  battery: 'Battery',
};

const UNAVAILABLE = 'Unavailable';

export const maskIpAddress = (address: string): string => address.replace(/\.\d+$/, '.•••');

export const formatBytes = (kilobytes: number): string => {
  const gigabytes = kilobytes / 1024 / 1024;
  return gigabytes >= 1 ? `${gigabytes.toFixed(1)} GB` : `${Math.round(kilobytes / 1024)} MB`;
};

const usage = (totalKb: number, availableKb: number, label: string): string =>
  `${formatBytes(totalKb - availableKb)} used of ${formatBytes(totalKb)} (${formatBytes(availableKb)} ${label})`;

const batteryEntries = (battery: BatteryInfo | undefined): InfoEntry[] =>
  battery
    ? [
        { label: 'Level', value: `${battery.levelPercent}%` },
        { label: 'Status', value: STATUS_LABELS[battery.status] },
        { label: 'Power source', value: SOURCE_LABELS[battery.powerSource] },
        { label: 'Temperature', value: `${battery.temperatureCelsius.toFixed(1)} °C` },
      ]
    : [{ label: 'Battery', value: UNAVAILABLE }];

const formatIp = (address: string | undefined, options: FormatOptions): string => {
  if (!address) {
    return 'Not connected';
  }
  return options.maskIpAddress ? maskIpAddress(address) : address;
};

export const formatSnapshot = (snapshot: DeviceSnapshot, options: FormatOptions): InfoGroup[] => {
  const { props, display, network, memory, storage } = snapshot;
  return [
    {
      label: 'Device',
      icon: 'device-mobile',
      entries: [
        { label: 'Model', value: `${props.manufacturer} ${props.model}`.trim() },
        { label: 'Android', value: `${props.androidVersion} (API ${props.sdk})` },
        { label: 'Display', value: `${display.resolution ?? UNAVAILABLE}${display.density === undefined ? '' : ` · ${display.density} dpi`}` },
        { label: 'CPU', value: props.abi },
      ],
    },
    { label: 'Battery', icon: 'zap', entries: batteryEntries(snapshot.battery) },
    {
      label: 'Resources',
      icon: 'pulse',
      entries: [
        { label: 'Memory', value: memory ? usage(memory.totalKb, memory.availableKb, 'free') : UNAVAILABLE },
        { label: 'Storage', value: storage ? usage(storage.totalKb, storage.availableKb, 'free') : UNAVAILABLE },
      ],
    },
    {
      label: 'Network',
      icon: 'globe',
      entries: [
        { label: 'Wi-Fi IP', value: formatIp(network.ipAddress, options) },
        { label: 'Airplane mode', value: network.airplaneMode ? 'On' : 'Off' },
      ],
    },
    { label: 'App', icon: 'package', entries: [{ label: 'Foreground', value: snapshot.foregroundPackage ?? UNAVAILABLE }] },
  ];
};
