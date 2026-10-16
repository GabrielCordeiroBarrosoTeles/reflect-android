import type { AdbServerClientLike, IAdbServerGateway } from '../../src/adb/types';
import { FakeAdbServerClient } from './FakeAdbServerClient';

export class FakeAdbServerGateway implements IAdbServerGateway {
  readonly client = new FakeAdbServerClient();
  failure: Error | undefined;

  getClient(): Promise<AdbServerClientLike> {
    return this.failure ? Promise.reject(this.failure) : Promise.resolve(this.client);
  }
}
