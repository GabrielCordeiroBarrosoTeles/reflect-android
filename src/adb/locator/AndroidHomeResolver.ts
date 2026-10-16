import { AdbResolver } from './AdbResolver';
import { platformToolsAdb } from './adbExecutable';

export class AndroidHomeResolver extends AdbResolver {
  constructor(private readonly env: NodeJS.ProcessEnv) {
    super();
  }

  protected candidates(): readonly string[] {
    return [this.env.ANDROID_HOME, this.env.ANDROID_SDK_ROOT]
      .filter((root): root is string => Boolean(root))
      .map(platformToolsAdb);
  }
}
