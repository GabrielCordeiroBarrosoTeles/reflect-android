import { byteSize, formatBytes, KIND_ICONS, KIND_LABELS, valueKind } from '../../storage/storageValue';
import type { StorageEntry } from '../../storage/types';
import { element } from '../dom';

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

export class KeyList {
  private entries: readonly StorageEntry[] = [];
  private filter = '';
  private selected: string | undefined;

  constructor(
    private readonly list: HTMLElement,
    private readonly summary: HTMLElement,
    search: HTMLInputElement,
    private readonly onSelect: (entry: StorageEntry) => void,
  ) {
    search.addEventListener('input', () => {
      this.filter = search.value.trim().toLowerCase();
      this.render();
    });
    list.addEventListener('keydown', (event) => this.move(event));
  }

  get selectedKey(): string | undefined {
    return this.selected;
  }

  update(entries: readonly StorageEntry[]): void {
    this.entries = entries;
    this.render();
  }

  select(key: string | undefined): void {
    this.selected = key;
    const entry = this.entries.find((candidate) => candidate.key === key);
    this.render();
    if (entry) {
      this.onSelect(entry);
    }
  }

  private visible(): readonly StorageEntry[] {
    return this.filter === '' ? this.entries : this.entries.filter(({ key }) => key.toLowerCase().includes(this.filter));
  }

  private render(): void {
    const visible = this.visible();
    const total = `${this.entries.length} ${this.entries.length === 1 ? 'key' : 'keys'}`;
    this.summary.textContent = visible.length === this.entries.length ? total : `${visible.length} of ${total}`;
    this.list.replaceChildren(...visible.map((entry) => this.row(entry)));
  }

  private row(entry: StorageEntry): HTMLElement {
    const kind = valueKind(entry.value);
    const row = element('li', 'key');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(entry.key === this.selected));
    row.title = `${entry.key} · ${KIND_LABELS[kind]}`;
    row.append(element('span', `key__type key__type--${kind}`, KIND_ICONS[kind]), element('span', 'key__name', entry.key), element('span', 'key__size', formatBytes(byteSize(entry.value))));
    row.addEventListener('click', () => this.select(entry.key));
    return row;
  }

  private move(event: KeyboardEvent): void {
    const step = STEPS[event.key];
    const visible = this.visible();
    if (step === undefined || visible.length === 0) {
      return;
    }
    event.preventDefault();
    const index = visible.findIndex(({ key }) => key === this.selected);
    const target = Math.min(visible.length - 1, Math.max(0, index + step));
    visible.forEach((entry, position) => position === target && this.select(entry.key));
  }
}
