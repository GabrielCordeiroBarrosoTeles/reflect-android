import { commandFor, failureOf, NETWORK_TOGGLES, parseActionsState, STATE_COMMAND } from '../appActions/deviceCommands';
import { permissionLabel } from '../appActions/permissionGroups';
import type { AppAction, BatteryMode, SettingToggle } from '../appActions/types';
import type { IActiveDeviceContext, IDeviceShell } from '../device/types';
import type { ActionsState } from '../shared/toolsProtocol';
import type { IToolsChannel } from './ToolsChannel';

export interface LinkHistory {
  get(): readonly string[];
  set(links: readonly string[]): void;
}

export interface ActionsServices {
  readonly shell: IDeviceShell;
  readonly context: IActiveDeviceContext;
  readonly confirm: (message: string, action: string) => Promise<boolean>;
  readonly links: LinkHistory;
}

const MAX_LINKS = 8;

const TOGGLE_LABELS: Readonly<Record<SettingToggle, string>> = {
  darkMode: 'Dark mode',
  animations: 'Animations',
  showTouches: 'Show touches',
  layoutBounds: 'Layout bounds',
  wifi: 'Wi-Fi',
  mobileData: 'Mobile data',
  airplane: 'Airplane mode',
};

const BATTERY_LABELS: Readonly<Record<BatteryMode, string>> = {
  reset: 'Battery back to the real state',
  critical: 'Battery set to 5%, unplugged',
  low: 'Battery set to 15%, unplugged',
  charging: 'Battery set to 50%, charging',
  full: 'Battery set to full',
};

const describe = (action: AppAction, app: string | undefined): string => {
  switch (action.kind) {
    case 'deep-link':
      return `Opened ${action.url}`;
    case 'restart':
      return `Restarted ${app}`;
    case 'clear-data':
      return `Cleared the data of ${app}`;
    case 'app-settings':
      return 'Opened the app settings on the device';
    case 'app-language':
      return action.locale === '' ? 'App language back to the system default' : `App language set to ${action.locale}`;
    case 'permission':
      return `${action.granted ? 'Granted' : 'Revoked'} ${action.permissions.map(permissionLabel).join(', ')}`;
    case 'toggle':
      return `${TOGGLE_LABELS[action.setting]} ${action.on ? 'on' : 'off'}`;
    case 'font-scale':
      return `Font size ${action.scale}×`;
    case 'battery':
      return BATTERY_LABELS[action.mode];
  }
};

const isWireless = (serial: string): boolean => serial.includes(':');

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class ActionsTab {
  private state: ActionsState = { kind: 'idle' };
  private app: string | undefined;

  constructor(
    private readonly services: ActionsServices,
    private readonly channel: IToolsChannel,
  ) {}

  setActive(active: boolean): void {
    if (active) {
      void this.refresh();
    }
  }

  async refresh(): Promise<void> {
    const device = this.services.context.mirroredDevice;
    if (!device) {
      this.show({ kind: 'idle' });
      return;
    }
    const output = await this.services.shell.run(device.id, STATE_COMMAND).catch((error: unknown) => new Error(errorMessage(error)));
    if (output instanceof Error) {
      this.show({ kind: 'failed', message: output.message });
      return;
    }
    const snapshot = parseActionsState(output);
    this.app = snapshot.app;
    this.show({ kind: 'ready', ...snapshot, links: this.services.links.get(), wirelessAdb: isWireless(device.id) });
  }

  async run(action: AppAction): Promise<void> {
    const device = this.services.context.mirroredDevice;
    const command = commandFor(action, this.app);
    if (!device || command === undefined) {
      this.result(false, !device ? 'Open a device first.' : action.kind === 'deep-link' ? 'Enter a link like myapp://screen or https://example.com/page.' : 'This action needs an app in the foreground.');
      return;
    }
    if (action.kind === 'toggle' && NETWORK_TOGGLES.has(action.setting) && isWireless(device.id)) {
      this.result(false, 'Reflect is connected over Wi-Fi, so turning Wi-Fi or airplane mode off would drop the connection. Use a USB cable for this.');
      return;
    }
    if (action.kind === 'clear-data' && !(await this.services.confirm(`Clear all data of ${this.app}? The app goes back to its first launch.`, 'Clear Data'))) {
      return;
    }
    const output = await this.services.shell.run(device.id, command).catch((error: unknown) => `Error: ${errorMessage(error)}`);
    const failure = failureOf(output);
    if (failure !== undefined) {
      this.result(false, failure);
      return;
    }
    if (action.kind === 'deep-link') {
      this.services.links.set([action.url, ...this.services.links.get().filter((link) => link !== action.url)].slice(0, MAX_LINKS));
    }
    this.result(true, describe(action, this.app));
    await this.refresh();
  }

  sync(): void {
    this.channel.post({ type: 'actions-state', state: this.state });
  }

  private show(state: ActionsState): void {
    this.state = state;
    this.sync();
  }

  private result(ok: boolean, message: string): void {
    this.channel.post({ type: 'actions-result', ok, message });
  }
}
