import type { IDisposable } from './types';

export const toDisposable = (dispose: () => void): IDisposable => ({ dispose });

export class DisposableStore implements IDisposable {
  private readonly items = new Set<IDisposable>();
  private disposed = false;

  add<T extends IDisposable>(item: T): T {
    if (this.disposed) {
      item.dispose();
      return item;
    }
    this.items.add(item);
    return item;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const item of this.items) {
      try {
        item.dispose();
      } catch {
        continue;
      }
    }
    this.items.clear();
  }
}
