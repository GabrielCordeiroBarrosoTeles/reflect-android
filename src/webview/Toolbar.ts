import type { ActionId, ToolbarItem } from '../shared/actions';
import { TOOLBAR_GROUPS } from '../shared/actions';
import type { ToolbarState } from '../shared/protocol';

const SECOND_MS = 1000;

const formatElapsed = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / SECOND_MS));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

export class Toolbar {
  private readonly buttons = new Map<ActionId, HTMLButtonElement>();
  private readonly groups: { readonly element: HTMLElement; readonly ids: readonly ActionId[] }[] = [];
  private readonly timer: HTMLSpanElement;
  private ticker: ReturnType<typeof setInterval> | undefined;

  constructor(
    root: HTMLElement,
    private readonly onAction: (id: ActionId) => void,
    private readonly now: () => number = Date.now,
  ) {
    for (const group of TOOLBAR_GROUPS) {
      const container = document.createElement('div');
      container.className = 'toolbar__group';
      for (const item of group) {
        container.append(this.createButton(item));
      }
      root.append(container);
      this.groups.push({ element: container, ids: group.map(({ id }) => id) });
    }
    this.timer = document.createElement('span');
    this.timer.className = 'toolbar__timer';
    this.timer.hidden = true;
    root.append(this.timer);
  }

  setAvailable(actions: readonly ActionId[]): void {
    for (const [id, button] of this.buttons) {
      button.hidden = !actions.includes(id);
    }
    for (const { element, ids } of this.groups) {
      element.hidden = ids.every((id) => !actions.includes(id));
    }
  }

  update(state: ToolbarState): void {
    this.setActive('screenPower', state.screenOff);
    this.setActive('record', state.recordingSince !== undefined);
    clearInterval(this.ticker);
    this.ticker = undefined;
    const since = state.recordingSince;
    this.timer.hidden = since === undefined;
    if (since !== undefined) {
      const tick = (): void => {
        this.timer.textContent = `● ${formatElapsed(this.now() - since)}`;
      };
      tick();
      this.ticker = setInterval(tick, SECOND_MS);
    }
  }

  dispose(): void {
    clearInterval(this.ticker);
  }

  private createButton(item: ToolbarItem): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `toolbar__button codicon codicon-${item.icon}`;
    button.title = item.title;
    button.setAttribute('aria-label', item.title);
    button.addEventListener('click', () => this.onAction(item.id));
    this.buttons.set(item.id, button);
    return button;
  }

  private setActive(id: ActionId, active: boolean): void {
    const button = this.buttons.get(id) as HTMLButtonElement;
    button.classList.toggle('toolbar__button--active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}
