import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

export abstract class AdbResolver {
  private next: AdbResolver | undefined;

  setNext(next: AdbResolver): AdbResolver {
    this.next = next;
    return next;
  }

  async resolve(searched: string[]): Promise<string | undefined> {
    for (const candidate of this.candidates()) {
      searched.push(candidate);
      if (await isExecutableFile(candidate)) {
        return candidate;
      }
    }
    return this.next?.resolve(searched);
  }

  protected abstract candidates(): readonly string[];
}

const isExecutableFile = async (path: string): Promise<boolean> => {
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      return false;
    }
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
};
