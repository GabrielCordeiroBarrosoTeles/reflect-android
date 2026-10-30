import type { ILogger } from '../../core/types';
import type { IDeviceLeasePool } from '../../device/types';
import type { Device } from '../../devices/types';
import { MirrorSession } from '../../scrcpy/MirrorSession';
import type { IScrcpyLauncher, IServerBinary, MirrorOptions } from '../../scrcpy/types';
import { GENERIC_FRAME } from '../../shared/deviceFrame';
import type { ActionId } from '../../shared/actions';
import type { DeviceFrame } from '../../shared/protocol';
import type { ToolsTab } from '../../shared/toolsProtocol';
import type { IMirrorSession, IPlatform, PlatformCapabilities, PlatformCopy } from '../types';

const ANDROID_ACTIONS: readonly ActionId[] = ['back', 'home', 'recents', 'rotate', 'screenPower', 'screenshot', 'record', 'devMenu', 'reload', 'reverseMetro'];

const ALL_TABS: readonly ToolsTab[] = ['component', 'network', 'logs', 'storage', 'device', 'performance', 'actions'];

const PHYSICAL_COPY: PlatformCopy = {
  reconnecting: 'Reconnecting… plug the cable back in',
  gaveUp: 'Device not found. Check the cable and USB debugging.',
};

const EMULATOR_COPY: PlatformCopy = {
  reconnecting: 'Emulator stopped — it will reconnect when it starts again',
  gaveUp: 'Emulator not found. Start it from Android Studio or with the emulator command.',
};

export interface EmulatorWindowHider {
  hide(serial: string): Promise<void>;
}

const hideWhenStreaming = (session: IMirrorSession, hide: () => Promise<void>): void => {
  const subscription = session.onDidChangeState(({ state }) => {
    if (state === 'streaming') {
      subscription.dispose();
      void hide();
    }
  });
};

export class AndroidPlatform implements IPlatform {
  readonly id = 'android';

  constructor(
    private readonly pool: IDeviceLeasePool,
    private readonly launcher: IScrcpyLauncher,
    private readonly serverBinary: IServerBinary,
    private readonly options: MirrorOptions,
    private readonly logger: ILogger,
    private readonly emulatorWindows: EmulatorWindowHider,
  ) {}

  capabilities(device: Device): PlatformCapabilities {
    const copy = device.kind === 'emulator' ? EMULATOR_COPY : PHYSICAL_COPY;
    return { actions: ANDROID_ACTIONS, tools: ALL_TABS, copy, videoDecoder: 'hardware', acceptsDrops: false };
  }

  frame(): DeviceFrame {
    return GENERIC_FRAME;
  }

  createMirrorSession(device: Device): IMirrorSession {
    const session = new MirrorSession(device, this.pool, this.launcher, this.serverBinary, this.options, this.logger);
    if (device.kind === 'emulator') {
      hideWhenStreaming(session, () => this.emulatorWindows.hide(device.id));
    }
    return session;
  }
}
