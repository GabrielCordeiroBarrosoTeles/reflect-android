import type { DeviceListItem, SessionStateKind } from '../shared/protocol';

const STATE_TITLES: Readonly<Record<SessionStateKind, string>> = {
  idle: 'Preparing…',
  connecting: 'Connecting…',
  streaming: '',
  disconnected: 'Disconnected',
  error: 'Unable to mirror',
  closed: 'Closed',
};

export type OverlayAction = 'open-device' | 'reconnect' | 'boot-device' | 'show-in-simulator';

const ACTION_LABELS: Readonly<Record<'open-device' | 'reconnect', string>> = {
  'open-device': 'Open Device',
  reconnect: 'Reconnect',
};

const IDLE_DETAIL = 'Connect a phone via USB with USB debugging on.';

const GROUPS: readonly { readonly kind: DeviceListItem['kind']; readonly title: string }[] = [
  { kind: 'physical', title: 'Android devices' },
  { kind: 'emulator', title: 'Android Emulators' },
  { kind: 'simulator', title: 'iOS Simulators' },
];

const rank = (device: DeviceListItem): number => (device.state === 'ready' ? 0 : 1);

const rowDetail = (device: DeviceListItem): string =>
  device.kind !== 'simulator' && (device.state === 'unauthorized' || device.state === 'offline') ? device.state : (device.detail ?? '');

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] => {
  const created = document.createElement(tag);
  created.className = className;
  created.textContent = text ?? null;
  return created;
};

export class StatusOverlay {
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly devicesList: HTMLElement;
  private readonly simulatorLink: HTMLButtonElement;
  private actionKind: OverlayAction = 'open-device';
  private devices: readonly DeviceListItem[] = [];
  private simulatorHidden = false;
  private idle = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly onAction: (action: OverlayAction, deviceId?: string) => void,
  ) {
    this.title = requireChild(root, '.status__title');
    this.detail = requireChild(root, '.status__detail');
    this.devicesList = requireChild(root, '.status__devices');
    this.action = requireChild(root, '.status__action') as HTMLButtonElement;
    this.simulatorLink = requireChild(root, '.status__link') as HTMLButtonElement;
    this.action.addEventListener('click', () => onAction(this.actionKind));
    this.simulatorLink.addEventListener('click', () => onAction('show-in-simulator'));
  }

  show(state: SessionStateKind, deviceName: string, detail?: string, canReconnect = false): void {
    this.render(STATE_TITLES[state], detail ?? deviceName, state);
    this.root.hidden = state === 'streaming';
    if (canReconnect) {
      this.showAction('reconnect');
    }
  }

  showMessage(title: string, detail: string): void {
    this.render(title, detail, 'error');
  }

  showIdle(): void {
    this.render('No device mirrored', IDLE_DETAIL, 'idle');
    this.idle = true;
    this.renderIdleContent();
  }

  setDevices(devices: readonly DeviceListItem[]): void {
    this.devices = devices;
    if (this.idle) {
      this.renderIdleContent();
    }
  }

  setSimulatorHidden(hidden: boolean): void {
    this.simulatorHidden = hidden;
    this.simulatorLink.hidden = !(this.idle && hidden);
  }

  private renderIdleContent(): void {
    this.devicesList.replaceChildren(...GROUPS.flatMap(({ kind, title }) => this.renderGroup(kind, title)));
    this.simulatorLink.hidden = !this.simulatorHidden;
    if (this.devices.length === 0) {
      this.detail.textContent = IDLE_DETAIL;
      this.showAction('open-device');
      return;
    }
    this.detail.textContent = '';
    this.action.hidden = true;
  }

  private renderGroup(kind: DeviceListItem['kind'], title: string): HTMLElement[] {
    const members = this.devices.filter((device) => device.kind === kind).sort((a, b) => rank(a) - rank(b));
    if (members.length === 0) {
      return [];
    }
    const group = element('section', 'status__group');
    group.append(element('h3', 'status__group-title', title), ...members.map((device) => this.renderRow(device)));
    return [group];
  }

  private renderRow(device: DeviceListItem): HTMLElement {
    const row = element('div', 'status__row');
    const label = element('span', 'status__row-label');
    label.append(element('span', 'status__row-name', device.name), element('span', 'status__row-detail', rowDetail(device)));
    row.append(label);
    if (device.state === 'ready' || device.state === 'shutdown') {
      const bootable = device.state === 'shutdown';
      const button = element('button', 'status__row-button', bootable ? 'Boot' : 'Bring to Reflect');
      button.type = 'button';
      button.dataset['deviceId'] = device.id;
      button.addEventListener('click', () => this.onAction(bootable ? 'boot-device' : 'open-device', device.id));
      row.append(button);
    }
    return row;
  }

  private showAction(kind: 'open-device' | 'reconnect'): void {
    this.actionKind = kind;
    this.action.textContent = ACTION_LABELS[kind];
    this.action.hidden = false;
  }

  private render(title: string, detail: string, state: string): void {
    this.root.hidden = false;
    this.root.dataset.state = state;
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.action.hidden = true;
    this.simulatorLink.hidden = true;
    this.devicesList.replaceChildren();
    this.idle = false;
  }
}

const requireChild = (root: HTMLElement, selector: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }
  return element;
};
