import { describe, expect, it } from 'vitest';
import { APP_LOCALES, BATTERY_MODES, commandFor, failureOf, FONT_SCALES, isAppAction, isDeepLink, isPackage, parseActionsState, parseAppLocale, parsePermissions, SETTING_TOGGLES, STATE_COMMAND } from '../../src/appActions/deviceCommands';
import { groupPermissions, permissionLabel } from '../../src/appActions/permissionGroups';
import type { AppAction } from '../../src/appActions/types';
import { ACTIONS_STATE_OUTPUT } from './fixtures';

describe('device state', () => {
  it('parses the foreground app, permissions, settings, battery and language from a real device', () => {
    const state = parseActionsState(ACTIONS_STATE_OUTPUT);
    expect([state.app, state.appLocale, state.permissions.length, state.permissions[2]]).toEqual(['br.com.client.hmlqa', '', 8, { name: 'android.permission.BLUETOOTH_CONNECT', granted: false }]);
    expect(state.settings).toEqual({ darkMode: true, fontScale: 1, animations: true, showTouches: false, layoutBounds: false, wifi: true, mobileData: true, airplane: false });
    expect(state.battery).toEqual({ level: 26, charging: true });
    expect(STATE_COMMAND).toContain("dumpsys battery | grep -E '^ +(level|status|AC powered|USB powered):'");
  });

  it('falls back to defaults when the device says nothing useful', () => {
    expect(parseActionsState('@@app \n@@night\nNight mode: no\n@@font\nnull\n@@anim\n0\n@@touches\n1\n@@bounds\ntrue\n@@battery\n  status: 3\n')).toEqual({
      app: undefined,
      appLocale: '',
      permissions: [],
      settings: { darkMode: false, fontScale: 1, animations: false, showTouches: true, layoutBounds: true, wifi: false, mobileData: false, airplane: false },
      battery: { level: undefined, charging: false },
    });
    expect(parseActionsState('').battery).toEqual({ level: undefined, charging: false });
    expect(parsePermissions('runtime permissions:\n  a.B: granted=true\n  a.B: granted=false\n  c.D: granted=false\n')).toEqual([
      { name: 'a.B', granted: true },
      { name: 'c.D', granted: false },
    ]);
    expect([parseAppLocale('Locales for x for user 0 are [pt_BR,en_US]'), parseAppLocale('Locales for x for user 0 are []'), parseAppLocale(undefined)]).toEqual(['pt-BR', '', '']);
  });
});

describe('permission groups', () => {
  it('groups permissions by kind, in a stable order, with background location last', () => {
    const groups = groupPermissions(parseActionsState(ACTIONS_STATE_OUTPUT).permissions);
    expect(groups.map(({ label }) => label)).toEqual(['Location', 'Camera', 'Microphone', 'Notifications', 'Contacts', 'Nearby devices']);
    expect(groups[0]?.permissions.map(({ name }) => name.replace('android.permission.', ''))).toEqual(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'ACCESS_BACKGROUND_LOCATION']);
    const all = ['READ_PHONE_STATE', 'SEND_SMS', 'READ_MEDIA_IMAGES', 'READ_CALENDAR', 'ACTIVITY_RECOGNITION', 'com.x.CUSTOM'].map((name) => ({ name: name.includes('.') ? name : `android.permission.${name}`, granted: true }));
    expect(groupPermissions(all).map(({ id, icon }) => `${id}:${icon}`)).toEqual(['phone:call-outgoing', 'sms:comment', 'media:folder', 'calendar:calendar', 'activity:pulse', 'other:shield']);
    expect(permissionLabel('android.permission.ACCESS_FINE_LOCATION')).toBe('Access fine location');
  });
});

describe('action commands', () => {
  const app = 'br.com.client.hmlqa';
  const command = (action: AppAction, pkg: string = app) => commandFor(action, pkg);

  it('builds each command for the foreground app', () => {
    expect([
      command({ kind: 'deep-link', url: 'mobilidade://trip/42?x=1' }),
      command({ kind: 'restart' }),
      command({ kind: 'clear-data' }),
      command({ kind: 'app-settings' }),
      command({ kind: 'app-language', locale: 'en-US' }),
      command({ kind: 'app-language', locale: '' }),
      command({ kind: 'permission', permissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION'], granted: true }),
      command({ kind: 'permission', permissions: ['android.permission.CAMERA'], granted: false }),
      command({ kind: 'font-scale', scale: 1.3 }),
    ]).toEqual([
      "am start -a android.intent.action.VIEW -d 'mobilidade://trip/42?x=1'",
      `am force-stop ${app} && monkey -p ${app} -c android.intent.category.LAUNCHER 1`,
      `pm clear ${app}`,
      `am start -a android.settings.APPLICATION_DETAILS_SETTINGS -d package:${app}`,
      `cmd locale set-app-locales ${app} --user 0 --locales 'en-US'`,
      `cmd locale set-app-locales ${app} --user 0 --locales ''`,
      `pm grant ${app} android.permission.ACCESS_FINE_LOCATION; pm grant ${app} android.permission.ACCESS_BACKGROUND_LOCATION`,
      `pm revoke ${app} android.permission.CAMERA`,
      'settings put system font_scale 1.3',
    ]);
    expect(SETTING_TOGGLES.flatMap((setting) => [command({ kind: 'toggle', setting, on: true }), command({ kind: 'toggle', setting, on: false })])).toEqual([
      'cmd uimode night yes',
      'cmd uimode night no',
      'settings put global window_animation_scale 1; settings put global transition_animation_scale 1; settings put global animator_duration_scale 1',
      'settings put global window_animation_scale 0; settings put global transition_animation_scale 0; settings put global animator_duration_scale 0',
      'settings put system show_touches 1',
      'settings put system show_touches 0',
      'setprop debug.layout true; service call activity 1599295570 > /dev/null',
      'setprop debug.layout false; service call activity 1599295570 > /dev/null',
      'svc wifi enable',
      'svc wifi disable',
      'svc data enable',
      'svc data disable',
      'cmd connectivity airplane-mode enable',
      'cmd connectivity airplane-mode disable',
    ]);
    expect(BATTERY_MODES.map((mode) => command({ kind: 'battery', mode }))).toEqual([
      'dumpsys battery reset',
      'dumpsys battery unplug; dumpsys battery set level 5',
      'dumpsys battery unplug; dumpsys battery set level 15',
      'dumpsys battery set ac 1; dumpsys battery set status 2; dumpsys battery set level 50',
      'dumpsys battery set ac 1; dumpsys battery set status 5; dumpsys battery set level 100',
    ]);
    expect([FONT_SCALES, APP_LOCALES]).toEqual([[0.85, 1, 1.15, 1.3, 1.5, 2], ['', 'pt-BR', 'en-US', 'es-ES', 'fr-FR']]);
  });

  it('refuses unsafe input and actions that need an app', () => {
    expect([
      command({ kind: 'deep-link', url: "x://a'; reboot" }),
      command({ kind: 'deep-link', url: 'no-scheme' }),
      command({ kind: 'deep-link', url: 'https://a b' }),
      commandFor({ kind: 'restart' }, undefined),
      command({ kind: 'clear-data' }, 'bad name; rm'),
      commandFor({ kind: 'app-settings' }, undefined),
      command({ kind: 'app-language', locale: "x'; reboot" }),
      commandFor({ kind: 'app-language', locale: 'en-US' }, undefined),
      command({ kind: 'permission', permissions: ['CAMERA; reboot'], granted: true }),
      command({ kind: 'permission', permissions: [], granted: true }),
      commandFor({ kind: 'permission', permissions: ['android.permission.CAMERA'], granted: true }, undefined),
      command({ kind: 'font-scale', scale: 9 }),
    ]).toEqual(Array.from({ length: 12 }, () => undefined));
    expect([isPackage('com.a'), isPackage('com'), isPackage(5), isDeepLink('https://a.b/c'), isDeepLink(1)]).toEqual([true, false, false, true, false]);
  });

  it('validates actions coming from the panel', () => {
    const valid: unknown[] = [
      { kind: 'deep-link', url: 'x' },
      { kind: 'restart' },
      { kind: 'clear-data' },
      { kind: 'app-settings' },
      { kind: 'app-language', locale: '' },
      { kind: 'permission', permissions: ['p'], granted: true },
      { kind: 'toggle', setting: 'wifi', on: false },
      { kind: 'font-scale', scale: 1 },
      { kind: 'battery', mode: 'low' },
    ];
    expect(valid.every(isAppAction)).toBe(true);
    const invalid: unknown[] = [null, 'restart', { kind: 'reboot' }, { kind: 'toString' }, { kind: 'deep-link' }, { kind: 'app-language' }, { kind: 'permission', permissions: 'p', granted: true }, { kind: 'permission', permissions: [1], granted: true }, { kind: 'permission', permissions: ['p'] }, { kind: 'toggle', setting: 'gps', on: true }, { kind: 'toggle', setting: 'wifi' }, { kind: 'font-scale', scale: '1' }, { kind: 'battery', mode: 'empty' }];
    expect(invalid.filter(isAppAction)).toEqual([]);
  });

  it('finds failures in the command output', () => {
    expect(failureOf('Starting: Intent { act=android.intent.action.VIEW }')).toBeUndefined();
    expect(failureOf('Starting: Intent\nError: Activity not started, unable to resolve Intent')).toBe('Error: Activity not started, unable to resolve Intent');
    expect(failureOf('Exception occurred while executing grant:\njava.lang.SecurityException: denied')).toBe('Exception occurred while executing grant:');
    expect(failureOf('Failure [not installed for 0]')).toBe('Failure [not installed for 0]');
  });
});
