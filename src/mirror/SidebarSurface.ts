import { Emitter } from '../core/Emitter';
import type { Event } from '../core/types';
import type { IMirrorSurface, IWebviewChannel } from './types';

export interface SidebarHost {
  readonly channel: IWebviewChannel;
  readonly visible: boolean;
  readonly onDidChangeVisibility: Event<boolean>;
  reveal(): void;
}

export class SidebarSurface implements IMirrorSurface {
  private readonly disposeEmitter = new Emitter<void>();
  private disposed = false;

  readonly onDidDispose = this.disposeEmitter.event;

  constructor(
    private readonly host: SidebarHost,
    private readonly onRelease: () => void,
  ) {}

  get channel(): IWebviewChannel {
    return this.host.channel;
  }

  get visible(): boolean {
    return this.host.visible;
  }

  get onDidChangeVisibility(): Event<boolean> {
    return this.host.onDidChangeVisibility;
  }

  reveal(): void {
    this.host.reveal();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.onRelease();
    this.disposeEmitter.fire();
    this.disposeEmitter.dispose();
  }
}
