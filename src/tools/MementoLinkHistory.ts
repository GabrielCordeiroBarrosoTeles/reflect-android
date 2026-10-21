import type { LinkHistory } from './ActionsTab';

export interface Memento {
  get<T>(key: string, defaultValue: T): T;
  update(key: string, value: unknown): Thenable<void>;
}

export class MementoLinkHistory implements LinkHistory {
  constructor(
    private readonly memento: Memento,
    private readonly key: string,
  ) {}

  get(): readonly string[] {
    const stored = this.memento.get<unknown>(this.key, []);
    return Array.isArray(stored) ? stored.filter((link): link is string => typeof link === 'string') : [];
  }

  set(links: readonly string[]): void {
    void this.memento.update(this.key, links);
  }
}
