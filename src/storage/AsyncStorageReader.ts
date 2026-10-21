import type { DeviceInfo } from '../adb/types';
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

  readAll(device: DeviceInfo): Promise<StorageResult> {
    return this.run(device, buildReadStorageScript());
  }

  remove(device: DeviceInfo, key: string): Promise<StorageResult> {
    return this.run(device, buildRemoveStorageScript(key));
  }

  set(device: DeviceInfo, key: string, value: string): Promise<StorageResult> {
    return this.run(device, buildSetStorageScript(key, value));
  }

  clear(device: DeviceInfo): Promise<StorageResult> {
    return this.run(device, buildClearStorageScript());
  }

  private async run(device: DeviceInfo, script: string): Promise<StorageResult> {
    const { backend } = await this.connections.connectionFor(device);
    await backend.evaluate(script);
    return pollEvaluation(backend, READ_STORAGE_RESULT_SCRIPT, parseStorageResult, this.timing);
  }
}
