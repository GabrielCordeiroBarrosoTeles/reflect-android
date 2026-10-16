import type { IDeviceShell } from '../device/types';
import { parseBattery } from './parsers/battery';
import { parseDisplay } from './parsers/display';
import { parseForeground } from './parsers/foreground';
import { parseMemory } from './parsers/memory';
import { parseNetwork } from './parsers/network';
import { parseProps } from './parsers/props';
import { splitSections } from './parsers/sections';
import { parseStorage } from './parsers/storage';
import type { DeviceSnapshot, IDeviceInfoCollector } from './types';

export const DEVICE_INFO_COMMAND = [
  'echo @@props',
  'getprop ro.product.manufacturer',
  'getprop ro.product.model',
  'getprop ro.build.version.release',
  'getprop ro.build.version.sdk',
  'getprop ro.product.cpu.abi',
  'echo @@battery',
  'dumpsys battery | grep -E "^ +(level|scale|status|temperature|AC powered|USB powered|Wireless powered):"',
  'echo @@memory',
  'grep -E "^(MemTotal|MemAvailable):" /proc/meminfo',
  'echo @@storage',
  'df -k /data | tail -1',
  'echo @@display',
  'wm size',
  'wm density',
  'echo @@network',
  'ip -f inet addr show wlan0 | grep -m1 inet',
  'settings get global airplane_mode_on',
  'echo @@foreground',
  'dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity',
].join('; ');

export class DeviceInfoCollector implements IDeviceInfoCollector {
  constructor(private readonly shell: IDeviceShell) {}

  async collect(serial: string): Promise<DeviceSnapshot> {
    const sections = splitSections(await this.shell.run(serial, DEVICE_INFO_COMMAND));
    const section = (name: string): string => sections.get(name) ?? '';
    return {
      props: parseProps(section('props')),
      battery: parseBattery(section('battery')),
      memory: parseMemory(section('memory')),
      storage: parseStorage(section('storage')),
      display: parseDisplay(section('display')),
      network: parseNetwork(section('network')),
      foregroundPackage: parseForeground(section('foreground')),
    };
  }
}
