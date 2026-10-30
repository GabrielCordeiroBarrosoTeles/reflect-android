import { basename, join } from 'node:path';
import type { DroppedContent } from '../shared/protocol';
import type { DropStagingFiles, StagedFiles } from './types';

const DROP_FOLDER = 'reflect-drops';

export class DropStaging {
  constructor(
    private readonly baseDirectory: string,
    private readonly newId: () => string,
    private readonly fs: DropStagingFiles,
  ) {}

  async stage(contents: readonly DroppedContent[]): Promise<StagedFiles> {
    if (contents.length === 0) {
      return { files: [], release: () => Promise.resolve() };
    }
    const directory = join(this.baseDirectory, DROP_FOLDER, this.newId());
    const release = (): Promise<void> => this.fs.rm(directory);
    try {
      await this.fs.mkdir(directory);
      const files = [];
      for (const [index, { name, data }] of contents.entries()) {
        const safeName = basename(name);
        const folder = join(directory, String(index));
        const path = join(folder, safeName);
        await this.fs.mkdir(folder);
        await this.fs.writeFile(path, data);
        files.push({ name: safeName, path });
      }
      return { files, release };
    } catch (error) {
      await release().catch(() => undefined);
      throw error;
    }
  }
}
