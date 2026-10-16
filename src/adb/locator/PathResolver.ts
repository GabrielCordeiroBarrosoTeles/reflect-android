import { delimiter, join } from 'node:path';
import { AdbResolver } from './AdbResolver';
import { ADB_EXECUTABLE } from './adbExecutable';

export class PathResolver extends AdbResolver {
  constructor(private readonly env: NodeJS.ProcessEnv) {
    super();
  }

  protected candidates(): readonly string[] {
    return (this.env.PATH ?? '')
      .split(delimiter)
      .filter(Boolean)
      .map((directory) => join(directory, ADB_EXECUTABLE));
  }
}
