import { NETWORK_TOGGLES, SETTING_TOGGLES } from '../../appActions/deviceCommands';
import { groupPermissions, permissionLabel } from '../../appActions/permissionGroups';
import type { AppAction, AppPermission, BatteryMode, PermissionGroup, SettingToggle } from '../../appActions/types';
import type { ActionsState } from '../../shared/toolsProtocol';
import { element, query } from '../dom';
import type { PostToolsMessage } from '../types';

type ReadyState = Extract<ActionsState, { kind: 'ready' }>;

const MESSAGES: Readonly<Record<Exclude<ActionsState['kind'], 'ready'>, string>> = {
  idle: 'Open a device to run actions on it.',
  failed: '',
};

const WIRELESS_NOTE = 'Not available while Reflect is connected over Wi-Fi';

const groupStatus = ({ permissions }: PermissionGroup): 'allowed' | 'denied' | 'partial' => {
  const granted = permissions.filter((permission) => permission.granted).length;
  if (granted === permissions.length) {
    return 'allowed';
  }
  return granted === 0 ? 'denied' : 'partial';
};

const STATUS_LABELS: Readonly<Record<ReturnType<typeof groupStatus>, string>> = { allowed: 'Allowed', denied: 'Denied', partial: 'Partly allowed' };

const switchInput = (checked: boolean, label: string, onChange: (checked: boolean) => void): HTMLInputElement => {
  const input = element('input', 'switch');
  input.type = 'checkbox';
  input.setAttribute('role', 'switch');
  input.setAttribute('aria-label', label);
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return input;
};

export class ActionsPanel {
  private readonly url: HTMLInputElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly post: PostToolsMessage,
  ) {
    this.url = query(root, '.deep-link__url');
    query<HTMLFormElement>(root, '.deep-link').addEventListener('submit', (event) => {
      event.preventDefault();
      this.run({ kind: 'deep-link', url: this.url.value.trim() });
    });
    query(root, '.app__restart').addEventListener('click', () => this.run({ kind: 'restart' }));
    query(root, '.app__clear').addEventListener('click', () => this.run({ kind: 'clear-data' }));
    query(root, '.app__settings').addEventListener('click', () => this.run({ kind: 'app-settings' }));
    query(root, '.actions__refresh').addEventListener('click', () => post({ type: 'actions-refresh' }));
    const locale = query<HTMLSelectElement>(root, '.setting-locale');
    locale.addEventListener('change', () => this.run({ kind: 'app-language', locale: locale.value }));
    const font = query<HTMLSelectElement>(root, '.setting-font');
    font.addEventListener('change', () => this.run({ kind: 'font-scale', scale: Number(font.value) }));
    const battery = query<HTMLSelectElement>(root, '.setting-battery');
    battery.addEventListener('change', () => this.run({ kind: 'battery', mode: battery.value as BatteryMode }));
    root.querySelectorAll<HTMLButtonElement>('[data-toggle]').forEach((tile) =>
      tile.addEventListener('click', () => this.run({ kind: 'toggle', setting: tile.dataset.toggle as SettingToggle, on: tile.getAttribute('aria-pressed') !== 'true' })),
    );
  }

  render(state: ActionsState): void {
    const ready = state.kind === 'ready';
    query<HTMLElement>(this.root, '.actions__empty').hidden = ready;
    query<HTMLElement>(this.root, '.actions__content').hidden = !ready;
    if (!ready) {
      query(this.root, '.actions__message').textContent = state.kind === 'failed' ? state.message : MESSAGES[state.kind];
      return;
    }
    query(this.root, '.actions__app').textContent = state.app ?? 'No app in the foreground';
    this.root.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('.app-control').forEach((control) => {
      control.disabled = state.app === undefined;
    });
    query<HTMLSelectElement>(this.root, '.setting-locale').value = state.appLocale;
    query(this.root, '.recent-links').replaceChildren(...state.links.map((link) => this.recent(link)));
    this.renderPermissions(state.permissions);
    this.renderTiles(state);
  }

  showResult(ok: boolean, message: string): void {
    const result = query<HTMLElement>(this.root, '.actions-result');
    result.hidden = false;
    result.textContent = message;
    result.dataset.state = ok ? 'ok' : 'error';
  }

  private run(action: AppAction): void {
    this.post({ type: 'actions-run', action });
  }

  private renderTiles(state: ReadyState): void {
    for (const setting of SETTING_TOGGLES) {
      const tile = query<HTMLButtonElement>(this.root, `[data-toggle="${setting}"]`);
      const on = state.settings[setting];
      const blocked = state.wirelessAdb && NETWORK_TOGGLES.has(setting);
      tile.setAttribute('aria-pressed', String(on));
      tile.disabled = blocked;
      tile.title = blocked ? WIRELESS_NOTE : '';
      query(tile, '.tile__state').textContent = on ? 'On' : 'Off';
    }
    query<HTMLSelectElement>(this.root, '.setting-font').value = String(state.settings.fontScale);
    const { level, charging } = state.battery;
    query(this.root, '.battery__state').textContent = level === undefined ? 'Unknown' : `${level}%${charging ? ' · charging' : ''}`;
    query<HTMLSelectElement>(this.root, '.setting-battery').value = 'reset';
  }

  private renderPermissions(permissions: readonly AppPermission[]): void {
    const groups = groupPermissions(permissions);
    const denied = groups.filter((group) => groupStatus(group) !== 'allowed').length;
    query(this.root, '.permissions__summary').textContent = groups.length === 0 ? '' : denied === 0 ? 'all allowed' : `${denied} not allowed`;
    query(this.root, '.permission-groups').replaceChildren(...(groups.length === 0 ? [element('li', 'muted', 'No runtime permissions')] : groups.map((group) => this.group(group))));
  }

  private group(group: PermissionGroup): HTMLElement {
    const status = groupStatus(group);
    const names = group.permissions.map(({ name }) => name);
    const row = element('li', `perm perm--${status}`);
    const header = element('div', 'perm__header');
    const toggle = switchInput(status === 'allowed', group.label, (granted) => this.run({ kind: 'permission', permissions: names, granted }));
    toggle.indeterminate = status === 'partial';
    header.append(element('i', `codicon codicon-${group.icon}`), element('span', 'perm__label', group.label), element('span', `perm__status perm__status--${status}`, STATUS_LABELS[status]), toggle);
    row.append(header);
    if (group.permissions.length > 1) {
      const more = element('details', 'perm__more');
      more.append(element('summary', 'perm__count', `${group.permissions.length} permissions`));
      const list = element('ul', 'perm__list');
      list.append(
        ...group.permissions.map(({ name, granted }) => {
          const item = element('li', 'perm__item');
          item.title = name;
          item.append(element('span', '', permissionLabel(name)), switchInput(granted, permissionLabel(name), (value) => this.run({ kind: 'permission', permissions: [name], granted: value })));
          return item;
        }),
      );
      more.append(list);
      row.append(more);
    }
    return row;
  }

  private recent(link: string): HTMLElement {
    const item = element('li', 'recent-link');
    const button = element('button', 'link recent-link__open', link);
    button.type = 'button';
    button.title = `Open ${link}`;
    button.addEventListener('click', () => {
      this.url.value = link;
      this.run({ kind: 'deep-link', url: link });
    });
    item.append(button);
    return item;
  }
}
