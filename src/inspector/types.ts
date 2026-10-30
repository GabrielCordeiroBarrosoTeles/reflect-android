import type { Device } from '../devices/types';
import type { Event, IDisposable } from '../core/types';
import type { BoxEdges, InspectHighlight } from '../shared/protocol';

export interface MetroTarget {
  readonly id: string;
  readonly title: string;
  readonly deviceName: string;
  readonly webSocketDebuggerUrl: string;
}

export interface StackFrame {
  readonly file: string;
  readonly lineNumber: number;
  readonly column: number;
  readonly methodName: string;
}

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface InspectedProp {
  readonly name: string;
  readonly value: string;
}

export interface InspectedComponent {
  readonly name: string;
  readonly props: readonly InspectedProp[];
  readonly owners: readonly string[];
  readonly source: SourceLocation | undefined;
}

export interface InspectPoint {
  readonly x: number;
  readonly y: number;
}

export interface HitResult {
  readonly elementId: number;
  readonly rendererID: number;
  readonly stacks: readonly string[];
}

export interface HoverOwner {
  readonly name: string;
  readonly stack: string;
}

export interface HoverRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly margin: BoxEdges;
  readonly padding: BoxEdges;
}

export interface HoverResult {
  readonly name: string;
  readonly owners: readonly HoverOwner[];
  readonly rect: HoverRect;
}

export interface IHttpClient {
  getJson(url: string): Promise<unknown>;
  postJson(url: string, body: unknown): Promise<unknown>;
}

export interface IMetroClient {
  readonly port: number;
  readonly origins: readonly string[];
  listTargets(): Promise<MetroTarget[]>;
  symbolicate(frames: readonly StackFrame[]): Promise<StackFrame[]>;
}

export interface ISocket {
  readonly onOpen: Event<void>;
  readonly onMessage: Event<string>;
  readonly onClose: Event<void>;
  send(data: string): void;
  close(): void;
}

export type SocketFactory = (url: string, origin: string) => ISocket;

export interface CdpEvent {
  readonly method: string;
  readonly params: unknown;
}

export interface ICdpSession extends IDisposable {
  readonly onEvent: Event<CdpEvent>;
  readonly onDidClose: Event<void>;
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
}

export type CdpConnector = (url: string) => Promise<ICdpSession>;

export interface IComponentInspector extends IDisposable {
  inspectAt(device: Device, point: InspectPoint): Promise<InspectedComponent | undefined>;
  highlightAt(device: Device, point: InspectPoint): Promise<InspectHighlight | undefined>;
  disconnect(): void;
}
