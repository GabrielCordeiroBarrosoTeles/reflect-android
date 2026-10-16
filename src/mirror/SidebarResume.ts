import type { DeviceInfo } from '../adb/types';
import { DisposableStore } from '../core/Disposable';
import type { Event, IDisposable } from '../core/types';
import type { MirrorClosed, MirrorLocation } from './types';

export interface ResumableMirrors {
  readonly onDidClose: Event<MirrorClosed>;
  open(device: DeviceInfo, location: MirrorLocation): void;
}

export class SidebarResume implements IDisposable {
  private readonly store = new DisposableStore();
  private pending: DeviceInfo | undefined;

  constructor(
    private readonly mirrors: ResumableMirrors,
    onDidChangeSidebarVisibility: Event<boolean>,
  ) {
    this.store.add(mirrors.onDidClose((closed) => this.remember(closed)));
    this.store.add(onDidChangeSidebarVisibility((visible) => this.resume(visible)));
  }

  dispose(): void {
    this.store.dispose();
  }

  private remember({ device, location, reason }: MirrorClosed): void {
    this.pending = location === 'secondarySidebar' && reason === 'hidden' ? device : undefined;
  }

  private resume(visible: boolean): void {
    const device = this.pending;
    if (!visible || !device) {
      return;
    }
    this.pending = undefined;
    this.mirrors.open(device, 'secondarySidebar');
  }
}
