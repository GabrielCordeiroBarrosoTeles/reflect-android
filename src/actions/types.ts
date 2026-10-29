import type { Device } from '../devices/types';
import type { IDeviceControl } from '../scrcpy/types';

export interface MirrorCapabilities {
  takeScreenshot(): Promise<void>;
  toggleRecording(): Promise<void>;
  toggleScreenPower(): Promise<void>;
}

export interface ActionServices {
  reloadApp(device: Device): Promise<boolean>;
  reverseMetro(device: Device): Promise<number>;
  notify(message: string): void;
}

export interface ActionContext {
  readonly device: Device;
  readonly control: IDeviceControl;
  readonly mirror: MirrorCapabilities;
  readonly services: ActionServices;
}

export type DeviceAction = (context: ActionContext) => Promise<void>;
