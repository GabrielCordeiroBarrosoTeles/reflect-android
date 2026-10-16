import type { SessionStateKind } from '../shared/protocol';

const STATE_TITLES: Readonly<Record<SessionStateKind, string>> = {
  idle: 'Preparing…',
  connecting: 'Connecting…',
  streaming: '',
  disconnected: 'Disconnected',
  error: 'Unable to mirror',
  closed: 'Closed',
};

export class StatusOverlay {
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly action: HTMLButtonElement;

  constructor(
    private readonly root: HTMLElement,
    onAction: () => void,
  ) {
    this.title = requireChild(root, '.status__title');
    this.detail = requireChild(root, '.status__detail');
    this.action = requireChild(root, '.status__action') as HTMLButtonElement;
    this.action.addEventListener('click', onAction);
  }

  show(state: SessionStateKind, deviceName: string, detail?: string): void {
    this.render(STATE_TITLES[state], detail ?? deviceName, state);
    this.root.hidden = state === 'streaming';
  }

  showMessage(title: string, detail: string): void {
    this.render(title, detail, 'error');
  }

  showIdle(): void {
    this.render('No device mirrored', 'Connect a phone via USB with USB debugging on.', 'idle');
    this.action.hidden = false;
  }

  private render(title: string, detail: string, state: string): void {
    this.root.hidden = false;
    this.root.dataset.state = state;
    this.title.textContent = title;
    this.detail.textContent = detail;
    this.action.hidden = true;
  }
}

const requireChild = (root: HTMLElement, selector: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Missing element ${selector}`);
  }
  return element;
};
