import type { DevicePanelState } from '../shared/toolsProtocol';
import { element, query } from './dom';
import type { PostToolsMessage } from './types';

const MESSAGES: Readonly<Record<Exclude<DevicePanelState['kind'], 'loaded'>, string>> = {
  idle: 'Open a device to see its details.',
  failed: 'Could not read device info. Use Refresh to try again.',
};

export class DeviceTab {
  constructor(
    private readonly root: HTMLElement,
    private readonly post: PostToolsMessage,
  ) {}

  render(state: DevicePanelState): void {
    const loaded = state.kind === 'loaded';
    query<HTMLElement>(this.root, '.device__empty').hidden = loaded;
    const groups = query(this.root, '.device__groups');
    if (!loaded) {
      query(this.root, '.device__message').textContent = MESSAGES[state.kind];
      groups.replaceChildren();
      return;
    }
    groups.replaceChildren(
      ...state.groups.map((group) => {
        const card = element('section', 'card');
        const title = element('h3', 'subtitle card__title');
        title.append(element('i', `codicon codicon-${group.icon}`), document.createTextNode(group.label));
        const pairs = element('dl', 'pairs');
        pairs.append(...group.entries.flatMap(({ label, value }) => this.pair(label, value)));
        card.append(title, pairs);
        return card;
      }),
    );
  }

  private pair(label: string, value: string): HTMLElement[] {
    const detail = element('dd', 'pairs__value', value);
    detail.title = 'Click to copy';
    detail.addEventListener('click', () => this.post({ type: 'copy', text: value }));
    return [element('dt', 'pairs__label', label), detail];
  }
}
