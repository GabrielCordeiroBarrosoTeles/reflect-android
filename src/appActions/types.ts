export interface AppPermission {
  readonly name: string;
  readonly granted: boolean;
}

export type BatteryMode = 'reset' | 'critical' | 'low' | 'charging' | 'full';

export interface BatteryState {
  readonly level: number | undefined;
  readonly charging: boolean;
}

export interface SystemSettings {
  readonly darkMode: boolean;
  readonly fontScale: number;
  readonly animations: boolean;
  readonly showTouches: boolean;
  readonly layoutBounds: boolean;
  readonly wifi: boolean;
  readonly mobileData: boolean;
  readonly airplane: boolean;
}

export interface ActionsSnapshot {
  readonly app: string | undefined;
  readonly appLocale: string;
  readonly permissions: readonly AppPermission[];
  readonly settings: SystemSettings;
  readonly battery: BatteryState;
}

export type SettingToggle = 'darkMode' | 'animations' | 'showTouches' | 'layoutBounds' | 'wifi' | 'mobileData' | 'airplane';

export type AppAction =
  | { readonly kind: 'deep-link'; readonly url: string }
  | { readonly kind: 'restart' }
  | { readonly kind: 'clear-data' }
  | { readonly kind: 'app-settings' }
  | { readonly kind: 'app-language'; readonly locale: string }
  | { readonly kind: 'permission'; readonly permissions: readonly string[]; readonly granted: boolean }
  | { readonly kind: 'toggle'; readonly setting: SettingToggle; readonly on: boolean }
  | { readonly kind: 'font-scale'; readonly scale: number }
  | { readonly kind: 'battery'; readonly mode: BatteryMode };

export interface PermissionGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly permissions: readonly AppPermission[];
}
