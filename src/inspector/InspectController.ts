import type { DeviceInfo } from '../adb/types';
import type { IDisposable } from '../core/types';
import type { IInspectHandler } from '../mirror/types';
import type { IComponentInspector, InspectedComponent, InspectPoint, SourceLocation } from './types';

export interface InspectServices {
  readonly inspector: IComponentInspector;
  readonly mirrors: { setInspectMode(active: boolean): void };
  readonly view: { show(component: InspectedComponent): void; reveal(): void };
  readonly openSource: (source: SourceLocation) => Promise<void>;
  readonly onError: (error: unknown) => void;
  readonly notify: (message: string) => void;
  readonly setActiveContext: (active: boolean) => void;
  readonly shouldOpenSource: () => boolean;
}

export class InspectController implements IInspectHandler, IDisposable {
  private active = false;
  private busy = false;

  constructor(private readonly services: InspectServices) {}

  get isActive(): boolean {
    return this.active;
  }

  start(): void {
    this.setActive(true);
  }

  cancel(): void {
    this.setActive(false);
    this.services.inspector.disconnect();
  }

  inspectAt(device: DeviceInfo, point: InspectPoint): void {
    if (!this.active || this.busy) {
      return;
    }
    this.busy = true;
    void this.inspect(device, point).finally(() => {
      this.busy = false;
    });
  }

  dispose(): void {
    this.services.inspector.dispose();
  }

  private async inspect(device: DeviceInfo, point: InspectPoint): Promise<void> {
    try {
      const component = await this.services.inspector.inspectAt(device, point);
      if (!component) {
        this.services.notify('No React component at that point');
        return;
      }
      this.setActive(false);
      this.services.view.show(component);
      this.services.view.reveal();
      if (component.source && this.services.shouldOpenSource()) {
        await this.services.openSource(component.source);
      }
    } catch (error) {
      this.cancel();
      this.services.onError(error);
    }
  }

  private setActive(active: boolean): void {
    this.active = active;
    this.services.setActiveContext(active);
    this.services.mirrors.setInspectMode(active);
  }
}
