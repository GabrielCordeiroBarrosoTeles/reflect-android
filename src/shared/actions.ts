export const ACTION_IDS = [
  'back',
  'home',
  'recents',
  'rotate',
  'screenPower',
  'screenshot',
  'record',
  'devMenu',
  'reload',
  'reverseMetro',
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

export interface ToolbarItem {
  readonly id: ActionId;
  readonly icon: string;
  readonly title: string;
}

export const ACTION_TITLES: Readonly<Record<ActionId, string>> = {
  back: 'Back',
  home: 'Home',
  recents: 'Recent Apps',
  rotate: 'Rotate',
  screenPower: 'Turn Device Screen On/Off',
  screenshot: 'Take Screenshot',
  record: 'Start/Stop Recording',
  devMenu: 'Open React Native Dev Menu',
  reload: 'Reload React Native App',
  reverseMetro: 'Reverse Metro Port (adb reverse)',
};

const item = (id: ActionId, icon: string): ToolbarItem => ({ id, icon, title: ACTION_TITLES[id] });

export const TOOLBAR_GROUPS: readonly (readonly ToolbarItem[])[] = [
  [item('back', 'arrow-left'), item('home', 'circle-large-outline'), item('recents', 'multiple-windows')],
  [item('rotate', 'sync'), item('screenPower', 'eye-closed')],
  [item('screenshot', 'device-camera'), item('record', 'record')],
  [item('devMenu', 'menu'), item('reload', 'refresh'), item('reverseMetro', 'plug')],
];

export const isActionId = (value: unknown): value is ActionId => (ACTION_IDS as readonly unknown[]).includes(value);
