import type { ILogger } from '../core/types';
import type { Device } from '../devices/types';
import type { DeviceAvailability } from '../mirror/AutoReconnect';
import type { IMirrorSession, IPlatform, PlatformCapabilities } from '../platform/types';
import { HelperMirrorSession } from './HelperMirrorSession';
import { IosDeviceControl } from './IosDeviceControl';
import type { SimulatorAppWindow } from './SimulatorAppWindow';
import { SimulatorPasteboard } from './SimulatorPasteboard';
import type { HelperCommand, HelperHello, HelperProcessFactory, ISimctl } from './types';

const CAPABILITIES: PlatformCapabilities = {
  actions: ['home', 'recents', 'rotate', 'screenPower', 'screenshot', 'record', 'devMenu', 'reload'],
  tools: ['component', 'network', 'storage'],
  copy: {
    reconnecting: 'Simulator was shut down — it will reconnect when it boots again',
    gaveUp: 'Simulator not found. Boot it from the Reflect side bar.',
  },
  videoDecoder: 'software',
};

export class IosPlatform implements IPlatform {
  readonly id = 'ios';

  constructor(
    private readonly spawn: HelperProcessFactory,
    private readonly simctl: ISimctl,
    private readonly logger: ILogger,
    private readonly window: Pick<SimulatorAppWindow, 'makeRoom'>,
    private readonly availability: DeviceAvailability,
  ) {}

  capabilities(): PlatformCapabilities {
    return CAPABILITIES;
  }

  createMirrorSession(device: Device): IMirrorSession {
    const pasteboard = new SimulatorPasteboard(this.simctl, device.id);
    return new HelperMirrorSession(device, {
      spawn: this.spawn,
      createControl: (send: (command: HelperCommand) => void, hello: HelperHello) => new IosDeviceControl(send, hello, pasteboard, { setTimeout }),
      logger: this.logger,
      pasteboard,
      availability: this.availability,
      onStreaming: (send) => void this.window.makeRoom(send),
    });
  }
}
