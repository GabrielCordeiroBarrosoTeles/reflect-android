import type { DeviceInfo } from '../adb/types';
import type { Event, IDisposable, ILogger } from '../core/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../shared/protocol';

export type MirrorErrorHandler = (error: unknown) => void;

export type MirrorLocation = 'secondarySidebar' | 'editor';

export type MirrorCloseReason = 'closed' | 'hidden';

export interface MirrorClosed {
  readonly device: DeviceInfo;
  readonly location: MirrorLocation;
  readonly reason: MirrorCloseReason;
}

export interface IClipboard {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface IInspectHandler {
  inspectAt(device: DeviceInfo, point: { readonly x: number; readonly y: number }): void;
  cancel(): void;
}

export interface MirrorServices {
  readonly logger: ILogger;
  readonly clipboard: IClipboard;
  readonly onError: MirrorErrorHandler;
  readonly inspector: IInspectHandler;
}

export interface IWebviewChannel {
  readonly onMessage: Event<WebviewToHostMessage>;
  post(message: HostToWebviewMessage): void;
}

export interface IMirrorSurface extends IDisposable {
  readonly channel: IWebviewChannel;
  readonly visible: boolean;
  readonly onDidChangeVisibility: Event<boolean>;
  readonly onDidDispose: Event<void>;
  reveal(): void;
}

export interface IMirrorController extends IDisposable {
  readonly device: DeviceInfo;
  readonly onDidDispose: Event<MirrorCloseReason>;
  reveal(): void;
  start(): void;
  setInspectMode(active: boolean): void;
}

export type MirrorControllerFactory = (device: DeviceInfo, location: MirrorLocation) => IMirrorController;
