import type { IHttpClient, IMetroClient, MetroTarget, StackFrame } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const toTarget = (value: unknown): MetroTarget | undefined => {
  if (!isRecord(value) || typeof value.webSocketDebuggerUrl !== 'string') {
    return undefined;
  }
  return {
    id: asString(value.id),
    title: asString(value.title),
    deviceName: asString(value.deviceName),
    webSocketDebuggerUrl: value.webSocketDebuggerUrl,
  };
};

const toFrame = (value: unknown): StackFrame | undefined => {
  if (!isRecord(value) || typeof value.file !== 'string' || typeof value.lineNumber !== 'number') {
    return undefined;
  }
  return {
    file: value.file,
    lineNumber: value.lineNumber,
    column: typeof value.column === 'number' ? value.column : 0,
    methodName: asString(value.methodName),
  };
};

const compact = <T>(values: readonly (T | undefined)[]): T[] => values.filter((value): value is T => value !== undefined);

export class MetroClient implements IMetroClient {
  constructor(
    private readonly http: IHttpClient,
    private readonly readPort: () => number,
  ) {}

  get port(): number {
    return this.readPort();
  }

  get origins(): readonly string[] {
    return [`http://127.0.0.1:${this.port}`, `http://localhost:${this.port}`];
  }

  async listTargets(): Promise<MetroTarget[]> {
    const response = await this.http.getJson(`http://localhost:${this.port}/json/list`);
    return Array.isArray(response) ? compact(response.map(toTarget)) : [];
  }

  async symbolicate(frames: readonly StackFrame[]): Promise<StackFrame[]> {
    const response = await this.http.postJson(`http://localhost:${this.port}/symbolicate`, { stack: frames });
    return isRecord(response) && Array.isArray(response.stack) ? compact(response.stack.map(toFrame)) : [];
  }
}
