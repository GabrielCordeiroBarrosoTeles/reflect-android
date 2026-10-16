import type { DeviceInfo } from '../adb/types';
import { deviceLabel } from '../adb/toDeviceInfo';
import { MetroUnavailableError, ReactNativeAppNotFoundError } from '../core/errors';
import { buildHitTestScript, parseHitResult, READ_HIT_RESULT_SCRIPT } from './hitTestScript';
import type { HitTestOutcome } from './hitTestScript';
import { ReactDevToolsBackend } from './ReactDevToolsBackend';
import { selectTarget } from './selectTarget';
import { findUserSource, parseStackFrames } from './stackFrames';
import { toInspectedComponent } from './toInspectedComponent';
import type { CdpConnector, ICdpSession, IComponentInspector, IMetroClient, InspectedComponent, InspectPoint, SourceLocation } from './types';

interface Connection {
  readonly serial: string;
  readonly session: ICdpSession;
  readonly backend: ReactDevToolsBackend;
}

export interface InspectorTiming {
  readonly pollIntervalMs: number;
  readonly pollAttempts: number;
  readonly timeoutMs: number;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class ComponentInspector implements IComponentInspector {
  private connection: Promise<Connection> | undefined;

  constructor(
    private readonly metro: IMetroClient,
    private readonly connect: CdpConnector,
    private readonly timing: InspectorTiming,
  ) {}

  async inspectAt(device: DeviceInfo, point: InspectPoint): Promise<InspectedComponent | undefined> {
    const { backend } = await this.connectionFor(device);
    await backend.evaluate(buildHitTestScript(point));
    const hit = await this.readHit(backend);
    if (hit.status !== 'hit') {
      return undefined;
    }
    const payload = await backend.inspectElement(hit.elementId, hit.rendererID);
    return toInspectedComponent(payload, await this.resolveSource(hit.stacks));
  }

  disconnect(): void {
    const connection = this.connection;
    this.connection = undefined;
    void connection?.then(
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

  private async connectionFor(device: DeviceInfo): Promise<Connection> {
    const current = await this.connection?.catch(() => undefined);
    if (current?.serial === device.serial) {
      return current;
    }
    this.disconnect();
    const connection = this.open(device);
    this.connection = connection;
    connection.catch(() => {
      if (this.connection === connection) {
        this.connection = undefined;
      }
    });
    return connection;
  }

  private async open(device: DeviceInfo): Promise<Connection> {
    const targets = await this.metro.listTargets().catch((error: unknown) => {
      throw new MetroUnavailableError(this.metro.port, error);
    });
    const target = selectTarget(targets, device);
    if (!target) {
      throw new ReactNativeAppNotFoundError(deviceLabel(device));
    }
    const session = await this.connect(target.webSocketDebuggerUrl);
    const backend = new ReactDevToolsBackend(session, this.timing.timeoutMs);
    try {
      await backend.initialize();
    } catch (error) {
      backend.dispose();
      session.dispose();
      throw error;
    }
    session.onDidClose(() => {
      void this.connection?.then((connection) => {
        if (connection.session === session) {
          this.connection = undefined;
        }
      });
    });
    return { serial: device.serial, session, backend };
  }

  private async readHit(backend: ReactDevToolsBackend): Promise<HitTestOutcome> {
    for (let attempt = 0; attempt < this.timing.pollAttempts; attempt += 1) {
      const outcome = parseHitResult(await backend.evaluate(READ_HIT_RESULT_SCRIPT));
      if (outcome.status !== 'pending') {
        return outcome;
      }
      await delay(this.timing.pollIntervalMs);
    }
    return { status: 'miss' };
  }

  private async resolveSource(stacks: readonly string[]): Promise<SourceLocation | undefined> {
    const frames = parseStackFrames(stacks);
    if (frames.length === 0) {
      return undefined;
    }
    const symbolicated = await this.metro.symbolicate(frames).catch(() => []);
    return findUserSource(symbolicated);
  }
}
