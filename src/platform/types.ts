import type { KeyInput, ScrollInput, TouchInput } from '../shared/protocol';

export type HardwareButton = 'back' | 'home' | 'recents' | 'menu' | 'lock' | 'volumeUp' | 'volumeDown' | 'siri' | 'shake';

export interface IDeviceControl {
  touch(input: TouchInput): Promise<void>;
  scroll(input: ScrollInput): Promise<void>;
  key(input: KeyInput): Promise<void>;
  text(text: string): Promise<void>;
  paste(text: string): Promise<void>;
  pressButton(button: HardwareButton): Promise<void>;
  rotate(): Promise<void>;
  setScreenPower(on: boolean): Promise<void>;
}
