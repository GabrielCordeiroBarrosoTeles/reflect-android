import type { ILogger } from '../../core/types';
import type { IDeviceLeasePool } from '../../device/types';
import type { Device } from '../../devices/types';
import { MirrorSession } from '../../scrcpy/MirrorSession';
import type { IScrcpyLauncher, IServerBinary, MirrorOptions } from '../../scrcpy/types';
import { ACTION_IDS } from '../../shared/actions';
import type { ToolsTab } from '../../shared/toolsProtocol';
import type { IMirrorSession, IPlatform, PlatformCapabilities } from '../types';

const ALL_TABS: readonly ToolsTab[] = ['component', 'network', 'logs', 'storage', 'device', 'performance', 'actions'];

const COPY = {
  reconnecting: 'Reconnecting… plug the cable back in',
  gaveUp: 'Device not found. Check the cable and USB debugging.',
};

export class AndroidPlatform implements IPlatform {
  readonly id = 'android';

  constructor(
    private readonly pool: IDeviceLeasePool,
    private readonly launcher: IScrcpyLauncher,
    private readonly serverBinary: IServerBinary,
    private readonly options: MirrorOptions,
    private readonly logger: ILogger,
  ) {}

  capabilities(): PlatformCapabilities {
    return { actions: ACTION_IDS, tools: ALL_TABS, copy: COPY };
  }

  createMirrorSession(device: Device): IMirrorSession {
    return new MirrorSession(device, this.pool, this.launcher, this.serverBinary, this.options, this.logger);
  }
}
