import type { DeviceInfo } from '../adb/types';
import type { IDeviceControl } from '../scrcpy/types';

export interface MirrorCapabilities {
  takeScreenshot(): Promise<void>;
  toggleRecording(): Promise<void>;
  toggleScreenPower(): Promise<void>;
}

export interface ActionServices {
  reloadApp(device: DeviceInfo): Promise<boolean>;
  reverseMetro(device: DeviceInfo): Promise<number>;
  notify(message: string): void;
}

export interface ActionContext {
  readonly device: DeviceInfo;
  readonly control: IDeviceControl;
  readonly mirror: MirrorCapabilities;
  readonly services: ActionServices;
}

export type DeviceAction = (context: ActionContext) => Promise<void>;
