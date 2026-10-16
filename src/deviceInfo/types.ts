export type BatteryStatus = 'charging' | 'discharging' | 'notCharging' | 'full' | 'unknown';

export type PowerSource = 'ac' | 'usb' | 'wireless' | 'battery';

export interface DeviceProps {
  readonly manufacturer: string;
  readonly model: string;
  readonly androidVersion: string;
  readonly sdk: string;
  readonly abi: string;
}

export interface BatteryInfo {
  readonly levelPercent: number;
  readonly status: BatteryStatus;
  readonly temperatureCelsius: number;
  readonly powerSource: PowerSource;
}

export interface MemoryInfo {
  readonly totalKb: number;
  readonly availableKb: number;
}

export interface StorageInfo {
  readonly totalKb: number;
  readonly availableKb: number;
}

export interface DisplayInfo {
  readonly resolution: string | undefined;
  readonly density: number | undefined;
}

export interface NetworkInfo {
  readonly ipAddress: string | undefined;
  readonly airplaneMode: boolean;
}

export interface DeviceSnapshot {
  readonly props: DeviceProps;
  readonly battery: BatteryInfo | undefined;
  readonly memory: MemoryInfo | undefined;
  readonly storage: StorageInfo | undefined;
  readonly display: DisplayInfo;
  readonly network: NetworkInfo;
  readonly foregroundPackage: string | undefined;
}

export interface InfoEntry {
  readonly label: string;
  readonly value: string;
}

export interface InfoGroup {
  readonly label: string;
  readonly icon: string;
  readonly entries: readonly InfoEntry[];
}

export interface IDeviceInfoCollector {
  collect(serial: string): Promise<DeviceSnapshot>;
}

export interface FormatOptions {
  readonly maskIpAddress: boolean;
}
