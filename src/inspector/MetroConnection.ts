import type { DeviceInfo } from '../adb/types';
import { deviceLabel } from '../adb/toDeviceInfo';
import { MetroUnavailableError, ReactNativeAppNotFoundError } from '../core/errors';
import type { IDisposable } from '../core/types';
import { ReactDevToolsBackend } from './ReactDevToolsBackend';
import { selectTarget } from './selectTarget';
import type { CdpConnector, ICdpSession, IMetroClient } from './types';

export interface AppConnection {
  readonly serial: string;
  readonly session: ICdpSession;
  readonly backend: ReactDevToolsBackend;
}

interface CurrentConnection {
  readonly serial: string;
  readonly connection: Promise<AppConnection>;
}

export class MetroConnection implements IDisposable {
  private current: CurrentConnection | undefined;

  constructor(
    private readonly metro: IMetroClient,
    private readonly connect: CdpConnector,
    private readonly timeoutMs: number,
  ) {}

  connectionFor(device: DeviceInfo): Promise<AppConnection> {
    if (this.current?.serial === device.serial) {
      return this.current.connection.catch(() => this.connectionFor(device));
    }
    this.disconnect();
    const current: CurrentConnection = { serial: device.serial, connection: this.open(device) };
    this.current = current;
    const forget = (): void => {
      if (this.current === current) {
        this.current = undefined;
      }
    };
    current.connection.then(({ session }) => session.onDidClose(forget), forget);
    return current.connection;
  }

  disconnect(): void {
    const current = this.current;
    this.current = undefined;
    void current?.connection.then(
      ({ session, backend }) => {
        backend.dispose();
        session.dispose();
      },
      () => undefined,
    );
  }

  dispose(): void {
    this.disconnect();
  }

  private async open(device: DeviceInfo): Promise<AppConnection> {
    const targets = await this.metro.listTargets().catch((error: unknown) => {
      throw new MetroUnavailableError(this.metro.port, error);
    });
    const target = selectTarget(targets, device);
    if (!target) {
      throw new ReactNativeAppNotFoundError(deviceLabel(device));
    }
    const session = await this.connect(target.webSocketDebuggerUrl);
    const backend = new ReactDevToolsBackend(session, this.timeoutMs);
    try {
      await backend.initialize();
    } catch (error) {
      backend.dispose();
      session.dispose();
      throw error;
    }
    return { serial: device.serial, session, backend };
  }
}
