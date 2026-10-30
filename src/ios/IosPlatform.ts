import type { ILogger } from '../core/types';
import type { Device } from '../devices/types';
import type { IMirrorSession, IPlatform, PlatformCapabilities } from '../platform/types';
import { HelperMirrorSession } from './HelperMirrorSession';
import { IosDeviceControl } from './IosDeviceControl';
import type { SimulatorAppWindow } from './SimulatorAppWindow';
import type { HelperProcessFactory, ISimctl } from './types';

const CAPABILITIES: PlatformCapabilities = {
  actions: ['home', 'recents', 'rotate', 'screenPower', 'screenshot', 'record', 'devMenu', 'reload'],
  tools: ['component', 'network', 'storage'],
};

export class IosPlatform implements IPlatform {
  readonly id = 'ios';

  constructor(
    private readonly spawn: HelperProcessFactory,
    private readonly simctl: ISimctl,
    private readonly logger: ILogger,
    private readonly window: Pick<SimulatorAppWindow, 'makeRoom'>,
  ) {}

  capabilities(): PlatformCapabilities {
    return CAPABILITIES;
  }

  createMirrorSession(device: Device): IMirrorSession {
    const createControl = (send: ConstructorParameters<typeof IosDeviceControl>[0], hello: ConstructorParameters<typeof IosDeviceControl>[1]) =>
      new IosDeviceControl(send, hello, this.simctl, device.id, { setTimeout });
    return new HelperMirrorSession(device, this.spawn, createControl, this.logger, this.simctl, (send) => void this.window.makeRoom(send));
  }
}
