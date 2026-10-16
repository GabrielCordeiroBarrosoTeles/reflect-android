import { AdbResolver } from './AdbResolver';

export class ConfigResolver extends AdbResolver {
  constructor(private readonly readConfiguredPath: () => string | undefined) {
    super();
  }

  protected candidates(): readonly string[] {
    const configured = this.readConfiguredPath()?.trim();
    return configured ? [configured] : [];
  }
}
