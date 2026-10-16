import { Emitter } from '../../src/core/Emitter';
import type { IMirrorSurface, IWebviewChannel } from '../../src/mirror/types';
import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/shared/protocol';

export class FakeChannel implements IWebviewChannel {
  readonly posted: HostToWebviewMessage[] = [];
  readonly messages = new Emitter<WebviewToHostMessage>();
  readonly onMessage = this.messages.event;

  post(message: HostToWebviewMessage): void {
    this.posted.push(message);
  }
}

export class FakeSurface implements IMirrorSurface {
  readonly channel = new FakeChannel();
  readonly visibility = new Emitter<boolean>();
  readonly closing = new Emitter<void>();
  readonly onDidChangeVisibility = this.visibility.event;
  readonly onDidDispose = this.closing.event;
  visible = true;
  revealed = 0;
  disposed = 0;

  reveal(): void {
    this.revealed += 1;
  }

  dispose(): void {
    this.disposed += 1;
    this.closing.fire();
  }
}
