import type { DeviceInfo } from '../adb/types';
import type { MetroConnection } from '../inspector/MetroConnection';
import { buildReadNetworkScript, CLEAR_NETWORK_SCRIPT, INSTALL_NETWORK_SCRIPT, parseNetworkRead } from './networkScripts';
import type { INetworkReader, NetworkResult } from './types';

export class NetworkReader implements INetworkReader {
  constructor(private readonly connections: Pick<MetroConnection, 'connectionFor'>) {}

  async read(device: DeviceInfo, since: number): Promise<NetworkResult> {
    const { backend } = await this.connections.connectionFor(device);
    const first = parseNetworkRead(await backend.evaluate(buildReadNetworkScript(since)));
    if (first.status !== 'not-installed') {
      return first;
    }
    if ((await backend.evaluate(INSTALL_NETWORK_SCRIPT)) !== 'installed') {
      return { status: 'unavailable' };
    }
    const second = parseNetworkRead(await backend.evaluate(buildReadNetworkScript(0)));
    return second.status === 'not-installed' ? { status: 'unavailable' } : second;
  }

  async clear(device: DeviceInfo): Promise<void> {
    const { backend } = await this.connections.connectionFor(device);
    await backend.evaluate(CLEAR_NETWORK_SCRIPT);
  }
}
