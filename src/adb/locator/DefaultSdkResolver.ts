import { join } from 'node:path';
import { AdbResolver } from './AdbResolver';
import { platformToolsAdb } from './adbExecutable';

const DEFAULT_SDK_LOCATIONS: Readonly<Partial<Record<NodeJS.Platform, readonly string[]>>> = {
  darwin: ['Library/Android/sdk'],
  linux: ['Android/Sdk'],
  win32: ['AppData/Local/Android/Sdk'],
};

export class DefaultSdkResolver extends AdbResolver {
  constructor(
    private readonly homeDir: string,
    private readonly platform: NodeJS.Platform,
  ) {
    super();
  }

  protected candidates(): readonly string[] {
    const locations = DEFAULT_SDK_LOCATIONS[this.platform] ?? [];
    return locations.map((location) => platformToolsAdb(join(this.homeDir, location)));
  }
}
