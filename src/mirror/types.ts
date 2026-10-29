import type { Device } from '../devices/types';
import type { Event, IDisposable, ILogger } from '../core/types';
import type { ActionServices } from '../actions/types';
import type { CaptureKind, ICaptureStore } from '../capture/types';
import type { IRecorder } from '../recording/types';
import type { ActionId } from '../shared/actions';
import type { HostToWebviewMessage, InspectHighlight, WebviewToHostMessage } from '../shared/protocol';
import type { DeviceAvailability, ReconnectTiming } from './AutoReconnect';

export type MirrorErrorHandler = (error: unknown) => void;

export type MirrorLocation = 'secondarySidebar' | 'editor';

export type MirrorCloseReason = 'closed' | 'hidden';

export interface MirrorClosed {
  readonly device: Device;
  readonly location: MirrorLocation;
  readonly reason: MirrorCloseReason;
}

export interface IClipboard {
  readText(): Promise<string>;
  writeText(text: string): Promise<void>;
}

export interface IInspectHandler {
  inspectAt(device: Device, point: { readonly x: number; readonly y: number }): void;
  hoverAt(device: Device, point: { readonly x: number; readonly y: number }, onHighlight: (highlight: InspectHighlight | undefined) => void): void;
  cancel(): void;
}

export interface MirrorServices {
  readonly logger: ILogger;
  readonly clipboard: IClipboard;
  readonly onError: MirrorErrorHandler;
  readonly inspector: IInspectHandler;
  readonly actions: ActionServices;
  readonly captures: ICaptureStore;
  readonly createRecorder: (path: string, onFormatChange: () => void) => IRecorder;
  readonly onCaptured: (kind: CaptureKind, path: string) => void;
  readonly availability: DeviceAvailability;
  readonly reconnectTiming: ReconnectTiming;
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
  readonly device: Device;
  readonly onDidDispose: Event<MirrorCloseReason>;
  reveal(): void;
  start(): void;
  setInspectMode(active: boolean): void;
  runAction(id: ActionId): Promise<void>;
}

export type MirrorControllerFactory = (device: Device, location: MirrorLocation) => IMirrorController;
