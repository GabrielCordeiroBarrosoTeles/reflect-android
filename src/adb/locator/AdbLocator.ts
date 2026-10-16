import { AdbNotFoundError } from '../../core/errors';
import type { IAdbLocator } from '../types';
import type { AdbResolver } from './AdbResolver';

export class AdbLocator implements IAdbLocator {
  constructor(private readonly chain: AdbResolver) {}

  async locate(): Promise<string> {
    const searched: string[] = [];
    const found = await this.chain.resolve(searched);
    if (!found) {
      throw new AdbNotFoundError(searched);
    }
    return found;
  }
}
