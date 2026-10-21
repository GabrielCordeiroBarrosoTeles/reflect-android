import type { ToolsTab } from '../shared/toolsProtocol';

export interface TabStore {
  get(): unknown;
  set(state: unknown): void;
}

const TABS: readonly ToolsTab[] = ['component', 'device', 'storage'];

const STEPS: Readonly<Record<string, (index: number, count: number) => number>> = {
  ArrowRight: (index, count) => (index + 1) % count,
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
};

const savedTab = (state: unknown): ToolsTab | undefined => {
  const tab = typeof state === 'object' && state !== null ? (state as { tab?: unknown }).tab : undefined;
  return TABS.find((candidate) => candidate === tab);
};

export class TabBar {
  private active: ToolsTab;
  private preferred: ToolsTab;

  constructor(
    private readonly root: ParentNode,
    private readonly store: TabStore,
    private readonly onChange: (tab: ToolsTab) => void,
  ) {
    this.preferred = savedTab(store.get()) ?? 'component';
    this.active = this.preferred;
    for (const button of this.buttons()) {
      button.addEventListener('click', () => this.select(button.dataset.tab as ToolsTab, false));
      button.addEventListener('keydown', (event) => this.navigate(event));
    }
  }

  get current(): ToolsTab {
    return this.active;
  }

  start(): void {
    this.show(this.isAvailable(this.preferred) ? this.preferred : 'component', false);
  }

  setAvailable(tab: ToolsTab, available: boolean): void {
    this.button(tab).hidden = !available;
    if (!available && this.active === tab) {
      this.show('component', false);
    }
    if (available && this.preferred === tab && this.active !== tab) {
      this.show(tab, false);
    }
  }

  select(tab: ToolsTab, focus: boolean): void {
    this.preferred = tab;
    this.store.set({ tab });
    this.show(tab, focus);
  }

  private show(tab: ToolsTab, focus: boolean): void {
    this.active = tab;
    for (const button of this.buttons()) {
      const selected = button.dataset.tab === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) {
        button.focus();
      }
    }
    this.root.querySelectorAll<HTMLElement>('.panel').forEach((panel) => {
      panel.hidden = panel.dataset.tab !== tab;
    });
    this.onChange(tab);
  }

  private navigate(event: KeyboardEvent): void {
    const step = STEPS[event.key];
    if (!step) {
      return;
    }
    event.preventDefault();
    const visible = this.buttons().filter((button) => !button.hidden);
    const index = visible.findIndex((button) => button.dataset.tab === this.active);
    const target = step(index, visible.length);
    visible.forEach((button, position) => position === target && this.select(button.dataset.tab as ToolsTab, true));
  }

  private isAvailable(tab: ToolsTab): boolean {
    return !this.button(tab).hidden;
  }

  private buttons(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll<HTMLButtonElement>('.tab')];
  }

  private button(tab: ToolsTab): HTMLButtonElement {
    return this.buttons().find((button) => button.dataset.tab === tab) as HTMLButtonElement;
  }
}
