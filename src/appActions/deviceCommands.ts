import type { ActionsSnapshot, AppAction, AppPermission, BatteryMode, SettingToggle, SystemSettings } from './types';

export const FONT_SCALES: readonly number[] = [0.85, 1, 1.15, 1.3, 1.5, 2];

export const APP_LOCALES: readonly string[] = ['', 'pt-BR', 'en-US', 'es-ES', 'fr-FR'];

export const BATTERY_MODES: readonly BatteryMode[] = ['reset', 'critical', 'low', 'charging', 'full'];

export const SETTING_TOGGLES: readonly SettingToggle[] = ['darkMode', 'animations', 'showTouches', 'layoutBounds', 'wifi', 'mobileData', 'airplane'];

const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;
const PERMISSION = /^[A-Za-z0-9_.]+$/;
const DEEP_LINK = /^[a-zA-Z][a-zA-Z0-9+.-]*:[^\s'"`\\$;|&<>]+$/;
const FOREGROUND_PACKAGE = "pkg=$(dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity | grep -oE '[A-Za-z0-9_.]+/' | head -n1 | tr -d /)";

export const isPackage = (value: unknown): value is string => typeof value === 'string' && PACKAGE.test(value);

export const isDeepLink = (value: unknown): value is string => typeof value === 'string' && DEEP_LINK.test(value);

const section = (name: string, command: string): string => `echo @@${name}; ${command}`;

export const STATE_COMMAND = [
  FOREGROUND_PACKAGE,
  'echo "@@app $pkg"',
  section('perms', `[ -n "$pkg" ] && dumpsys package "$pkg" | grep -A120 'runtime permissions:' | head -n 120`),
  section('night', 'cmd uimode night'),
  section('font', 'settings get system font_scale'),
  section('anim', 'settings get global animator_duration_scale'),
  section('touches', 'settings get system show_touches'),
  section('bounds', 'getprop debug.layout'),
  section('wifi', 'settings get global wifi_on'),
  section('data', 'settings get global mobile_data'),
  section('airplane', 'settings get global airplane_mode_on'),
  section('battery', "dumpsys battery | grep -E '^ +(level|status|AC powered|USB powered):'"),
  section('locale', '[ -n "$pkg" ] && cmd locale get-app-locales "$pkg" 2>/dev/null'),
].join('; ');

const sections = (text: string): Map<string, string> => {
  const result = new Map<string, string>();
  let name = '';
  for (const line of text.split(/\r?\n/)) {
    const marker = /^@@(\w+)\s*(.*)$/.exec(line);
    if (marker) {
      name = String(marker[1]);
      result.set(name, String(marker[2]));
    } else {
      result.set(name, `${result.get(name) ?? ''}${line}\n`);
    }
  }
  return result;
};

export const parsePermissions = (text: string): AppPermission[] => {
  const block = /runtime permissions:\n([\s\S]*?)(?:\n\s*\S[^:\n]*:\n|$)/.exec(text)?.[1] ?? '';
  const seen = new Set<string>();
  return [...block.matchAll(/^\s+([A-Za-z0-9_.]+): granted=(true|false)/gm)]
    .map((match) => ({ name: String(match[1]), granted: match[2] === 'true' }))
    .filter(({ name }) => !seen.has(name) && Boolean(seen.add(name)));
};

const flag = (text: string | undefined): boolean => /^(1|true|yes)$/i.test((text ?? '').trim());

const numberIn = (text: string | undefined, pattern: RegExp): number | undefined => {
  const value = Number.parseFloat(pattern.exec(text ?? '')?.[1] ?? '');
  return Number.isFinite(value) ? value : undefined;
};

export const parseAppLocale = (text: string | undefined): string => /are \[([^\]]*)\]/.exec(text ?? '')?.[1]?.split(',')[0]?.trim().replace('_', '-') ?? '';

export const parseActionsState = (text: string): ActionsSnapshot => {
  const parts = sections(text);
  const app = (parts.get('app') ?? '').trim();
  const animationScale = numberIn(parts.get('anim'), /(-?[\d.]+)/);
  const battery = parts.get('battery');
  const settings: SystemSettings = {
    darkMode: /night mode:\s*yes/i.test(parts.get('night') ?? ''),
    fontScale: numberIn(parts.get('font'), /([\d.]+)/) ?? 1,
    animations: animationScale === undefined || animationScale > 0,
    showTouches: flag(parts.get('touches')),
    layoutBounds: flag(parts.get('bounds')),
    wifi: flag(parts.get('wifi')),
    mobileData: flag(parts.get('data')),
    airplane: flag(parts.get('airplane')),
  };
  return {
    app: app === '' ? undefined : app,
    appLocale: parseAppLocale(parts.get('locale')),
    permissions: parsePermissions(parts.get('perms') ?? ''),
    settings,
    battery: { level: numberIn(battery, /level:\s*(\d+)/), charging: /status:\s*2\b/.test(battery ?? '') },
  };
};

const onOff = (on: boolean): string => (on ? '1' : '0');

const TOGGLE_COMMANDS: Readonly<Record<SettingToggle, (on: boolean) => string>> = {
  darkMode: (on) => `cmd uimode night ${on ? 'yes' : 'no'}`,
  animations: (on) => ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'].map((name) => `settings put global ${name} ${onOff(on)}`).join('; '),
  showTouches: (on) => `settings put system show_touches ${onOff(on)}`,
  layoutBounds: (on) => `setprop debug.layout ${on ? 'true' : 'false'}; service call activity 1599295570 > /dev/null`,
  wifi: (on) => `svc wifi ${on ? 'enable' : 'disable'}`,
  mobileData: (on) => `svc data ${on ? 'enable' : 'disable'}`,
  airplane: (on) => `cmd connectivity airplane-mode ${on ? 'enable' : 'disable'}`,
};

const BATTERY_COMMANDS: Readonly<Record<BatteryMode, string>> = {
  reset: 'dumpsys battery reset',
  critical: 'dumpsys battery unplug; dumpsys battery set level 5',
  low: 'dumpsys battery unplug; dumpsys battery set level 15',
  charging: 'dumpsys battery set ac 1; dumpsys battery set status 2; dumpsys battery set level 50',
  full: 'dumpsys battery set ac 1; dumpsys battery set status 5; dumpsys battery set level 100',
};

export const NETWORK_TOGGLES: ReadonlySet<SettingToggle> = new Set(['wifi', 'airplane']);

export const commandFor = (action: AppAction, app: string | undefined): string | undefined => {
  const pkg = isPackage(app) ? app : undefined;
  switch (action.kind) {
    case 'deep-link':
      return isDeepLink(action.url) ? `am start -a android.intent.action.VIEW -d '${action.url}'` : undefined;
    case 'restart':
      return pkg && `am force-stop ${pkg} && monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`;
    case 'clear-data':
      return pkg && `pm clear ${pkg}`;
    case 'app-settings':
      return pkg && `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:${pkg}`;
    case 'app-language':
      return pkg && APP_LOCALES.includes(action.locale) ? `cmd locale set-app-locales ${pkg} --user 0 --locales '${action.locale}'` : undefined;
    case 'permission':
      return pkg && action.permissions.length > 0 && action.permissions.every((name) => PERMISSION.test(name))
        ? action.permissions.map((name) => `pm ${action.granted ? 'grant' : 'revoke'} ${pkg} ${name}`).join('; ')
        : undefined;
    case 'toggle':
      return TOGGLE_COMMANDS[action.setting](action.on);
    case 'font-scale':
      return FONT_SCALES.includes(action.scale) ? `settings put system font_scale ${action.scale}` : undefined;
    case 'battery':
      return BATTERY_COMMANDS[action.mode];
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const VALIDATORS: Readonly<Record<AppAction['kind'], (action: Record<string, unknown>) => boolean>> = {
  'deep-link': ({ url }) => typeof url === 'string',
  restart: () => true,
  'clear-data': () => true,
  'app-settings': () => true,
  'app-language': ({ locale }) => typeof locale === 'string',
  permission: ({ permissions, granted }) => Array.isArray(permissions) && permissions.every((name) => typeof name === 'string') && isBoolean(granted),
  toggle: ({ setting, on }) => SETTING_TOGGLES.includes(setting as SettingToggle) && isBoolean(on),
  'font-scale': ({ scale }) => typeof scale === 'number',
  battery: ({ mode }) => BATTERY_MODES.includes(mode as BatteryMode),
};

export const isAppAction = (value: unknown): value is AppAction =>
  isRecord(value) && Object.hasOwn(VALIDATORS, String(value.kind)) && VALIDATORS[value.kind as AppAction['kind']](value);

export const failureOf = (output: string): string | undefined =>
  output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^(error|exception|security exception|java\.lang\.\w+exception)|unable to resolve|not found|failure/i.test(line));
