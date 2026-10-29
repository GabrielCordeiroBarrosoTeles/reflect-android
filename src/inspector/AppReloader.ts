import type { Device } from '../devices/types';
import { selectTarget } from './selectTarget';
import type { CdpConnector, IMetroClient } from './types';

export class AppReloader {
  constructor(
    private readonly metro: IMetroClient,
    private readonly connect: CdpConnector,
  ) {}

  async reload(device: Device): Promise<boolean> {
    try {
      const target = selectTarget(await this.metro.listTargets(), device);
      if (!target) {
        return false;
      }
      const session = await this.connect(target.webSocketDebuggerUrl);
      try {
        await session.send('Page.reload');
        return true;
      } finally {
        session.dispose();
      }
    } catch {
      return false;
    }
  }
}
