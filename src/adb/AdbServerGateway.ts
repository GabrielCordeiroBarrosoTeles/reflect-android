import { AdbServerUnavailableError } from '../core/errors';
import type { AdbServerClientLike, AdbServerEndpoint, IAdbLocator, IAdbServerGateway, ProcessRunner } from './types';

export const DEFAULT_ADB_ENDPOINT: AdbServerEndpoint = { host: '127.0.0.1', port: 5037 };

export class AdbServerGateway implements IAdbServerGateway {
  private ready: Promise<AdbServerClientLike> | undefined;

  constructor(
    private readonly locator: IAdbLocator,
    private readonly processRunner: ProcessRunner,
    private readonly client: AdbServerClientLike,
  ) {}

  getClient(): Promise<AdbServerClientLike> {
    this.ready ??= this.ensureServer().catch((error: unknown) => {
      this.ready = undefined;
      throw error;
    });
    return this.ready;
  }

  private async ensureServer(): Promise<AdbServerClientLike> {
    if (await this.isReachable()) {
      return this.client;
    }
    const adbPath = await this.locator.locate();
    try {
      await this.processRunner.run(adbPath, ['start-server']);
    } catch (error) {
      throw new AdbServerUnavailableError(error);
    }
    if (!(await this.isReachable())) {
      throw new AdbServerUnavailableError();
    }
    return this.client;
  }

  private async isReachable(): Promise<boolean> {
    try {
      await this.client.getVersion();
      return true;
    } catch {
      return false;
    }
  }
}
