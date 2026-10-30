import { isGenericFrame } from '../shared/deviceFrame';
import type { DeviceFrame } from '../shared/protocol';
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

const FRAME_PROPERTIES = ['--reflect-frame-radius', '--reflect-frame-bezel-width', '--reflect-frame-chin'];

const pixels = (value: number): string => `${Math.round(value * 100) / 100}px`;

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
  private deviceFrame: DeviceFrame | undefined;
  private homeButton: HTMLElement | undefined;

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

  setFrame(frame: DeviceFrame): void {
    this.deviceFrame = frame;
    this.applyFrame();
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
    this.applyFrame();
  }

  private applyFrame(): void {
    const frame = this.deviceFrame;
    if (!frame || isGenericFrame(frame)) {
      this.clearFrame();
      return;
    }
    const width = this.canvas.offsetWidth;
    this.stage.style.setProperty('--reflect-frame-radius', pixels(frame.screenCornerRadius * width));
    this.stage.style.setProperty('--reflect-frame-bezel-width', pixels(frame.bezel * width));
    this.stage.style.setProperty('--reflect-frame-chin', pixels(frame.chin * width));
    this.placeHomeButton(frame.chin > 0 && this.state.frame, frame.chin * width);
  }

  private clearFrame(): void {
    for (const name of FRAME_PROPERTIES) {
      this.stage.style.removeProperty(name);
    }
    this.placeHomeButton(false, 0);
  }

  private placeHomeButton(visible: boolean, chin: number): void {
    if (!visible) {
      this.homeButton?.remove();
      this.homeButton = undefined;
      return;
    }
    const button = this.homeButton ?? this.stage.appendChild(document.createElement('div'));
    button.className = 'home-button';
    button.style.left = `${this.canvas.offsetLeft + this.canvas.offsetWidth / 2}px`;
    button.style.top = `${this.canvas.offsetTop + this.canvas.offsetHeight + chin / 2}px`;
    this.homeButton = button;
  }
}
