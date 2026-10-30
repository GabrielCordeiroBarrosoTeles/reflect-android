import type { Device } from '../devices/types';
import type { MetroConnection } from '../inspector/MetroConnection';
import { pollEvaluation } from '../inspector/pollEvaluation';
import type { PollTiming } from '../inspector/pollEvaluation';
import { buildClearStorageScript, buildReadStorageScript, buildRemoveStorageScript, buildSetStorageScript, parseStorageResult, READ_STORAGE_RESULT_SCRIPT } from './storageScripts';
import type { IStorageReader, StorageResult } from './types';

export class AsyncStorageReader implements IStorageReader {
  constructor(
    private readonly connections: Pick<MetroConnection, 'connectionFor'>,
    private readonly timing: PollTiming,
  ) {}

  readAll(device: Device): Promise<StorageResult> {
    return this.run(device, buildReadStorageScript());
  }

  remove(device: Device, key: string): Promise<StorageResult> {
    return this.run(device, buildRemoveStorageScript(key));
  }

  set(device: Device, key: string, value: string): Promise<StorageResult> {
    return this.run(device, buildSetStorageScript(key, value));
  }

  clear(device: Device): Promise<StorageResult> {
    return this.run(device, buildClearStorageScript());
  }

  private async run(device: Device, script: string): Promise<StorageResult> {
    const { backend } = await this.connections.connectionFor(device);
    await backend.evaluate(script);
    return pollEvaluation(backend, READ_STORAGE_RESULT_SCRIPT, parseStorageResult, this.timing);
  }
}
