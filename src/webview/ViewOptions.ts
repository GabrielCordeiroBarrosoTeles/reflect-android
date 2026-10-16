import type { Disposable } from './input/types';

export type ZoomMode = 'fit' | 'actual';

export interface ViewState {
  readonly frame: boolean;
  readonly zoom: ZoomMode;
}

export interface ViewStateStore {
  getState(): unknown;
  setState(state: unknown): void;
}

interface ToggleButton {
  readonly element: HTMLButtonElement;
  readonly isActive: (state: ViewState) => boolean;
}

const DEFAULT_STATE: ViewState = { frame: false, zoom: 'fit' };

const readState = (raw: unknown): ViewState => {
  if (typeof raw !== 'object' || raw === null) {
    return DEFAULT_STATE;
  }
  const { frame, zoom } = raw as Record<string, unknown>;
  return { frame: frame === true, zoom: zoom === 'actual' ? 'actual' : 'fit' };
};

export class ViewOptions implements Disposable {
  private state: ViewState;
  private readonly buttons: ToggleButton[] = [];
  private readonly observer: MutationObserver;
  private readonly abort = new AbortController();

  constructor(
    toolbar: HTMLElement,
    private readonly stage: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly store: ViewStateStore,
  ) {
    this.state = readState(store.getState());
    const group = document.createElement('div');
    group.className = 'toolbar__group';
    group.append(
      this.createButton('device-mobile', 'Show Device Frame', (state) => state.frame, (state) => ({ ...state, frame: !state.frame })),
      this.createButton('zoom-in', 'Actual Size (1:1)', (state) => state.zoom === 'actual', (state) => ({ ...state, zoom: state.zoom === 'actual' ? 'fit' : 'actual' })),
    );
    toolbar.insertBefore(group, toolbar.querySelector('.toolbar__timer'));
    this.observer = new MutationObserver(() => this.applySize());
    this.observer.observe(canvas, { attributes: true, attributeFilter: ['width', 'height'] });
    window.addEventListener('resize', () => this.applySize(), { signal: this.abort.signal });
    this.apply();
  }

  get current(): ViewState {
    return this.state;
  }

  dispose(): void {
    this.observer.disconnect();
    this.abort.abort();
  }

  private createButton(icon: string, title: string, isActive: (state: ViewState) => boolean, toggle: (state: ViewState) => ViewState): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = `toolbar__button codicon codicon-${icon}`;
    element.title = title;
    element.setAttribute('aria-label', title);
    element.addEventListener('click', () => {
      this.state = toggle(this.state);
      this.store.setState(this.state);
      this.apply();
    });
    this.buttons.push({ element, isActive });
    return element;
  }

  private apply(): void {
    this.stage.classList.toggle('stage--framed', this.state.frame);
    this.stage.classList.toggle('stage--actual', this.state.zoom === 'actual');
    for (const { element, isActive } of this.buttons) {
      const active = isActive(this.state);
      element.classList.toggle('toolbar__button--toggled', active);
      element.setAttribute('aria-pressed', String(active));
    }
    this.applySize();
  }

  private applySize(): void {
    const actual = this.state.zoom === 'actual' && this.canvas.width > 0;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.style.width = actual ? `${this.canvas.width / ratio}px` : '';
    this.canvas.style.height = actual ? `${this.canvas.height / ratio}px` : '';
  }
}
