import { DisposableStore } from '../core/Disposable';
import type { IDisposable } from '../core/types';
import type { DeviceInfoPoller, PollerState } from '../deviceInfo/DeviceInfoPoller';
import { formatSnapshot } from '../deviceInfo/formatSnapshot';
import type { FormatOptions } from '../deviceInfo/types';
import type { IActiveDeviceContext } from '../device/types';
import type { DevicePanelState } from '../shared/toolsProtocol';
import type { IToolsChannel } from './ToolsChannel';

export class DeviceTab implements IDisposable {
  private readonly store = new DisposableStore();
  private state: PollerState = { kind: 'idle' };

  constructor(
    private readonly poller: Pick<DeviceInfoPoller, 'onDidChangeState' | 'setTarget' | 'setVisible' | 'refresh'>,
    private readonly context: IActiveDeviceContext,
    private readonly readOptions: () => FormatOptions,
    private readonly channel: IToolsChannel,
  ) {
    this.store.add(
      poller.onDidChangeState((state) => {
        this.state = state;
        this.sync();
      }),
    );
    this.store.add(context.onDidChange(() => this.syncTarget()));
    this.syncTarget();
  }

  setActive(active: boolean): void {
    this.poller.setVisible(active);
  }

  refresh(): void {
    this.poller.refresh();
  }

  sync(): void {
    this.channel.post({ type: 'device', state: this.toPanelState() });
  }

  dispose(): void {
    this.store.dispose();
  }

  private syncTarget(): void {
    this.poller.setTarget(this.context.target?.id);
  }

  private toPanelState(): DevicePanelState {
    return this.state.kind === 'loaded' ? { kind: 'loaded', groups: formatSnapshot(this.state.snapshot, this.readOptions()) } : { kind: this.state.kind };
  }
}
