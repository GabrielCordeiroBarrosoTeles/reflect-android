import type { ComponentPanelView } from '../shared/toolsProtocol';
import { element, query } from './dom';
import type { PostToolsMessage } from './types';

export class ComponentTab {
  private view: ComponentPanelView | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly post: PostToolsMessage,
  ) {
    query(root, '.component__source').addEventListener('click', () => {
      if (this.view?.source) {
        this.post({ type: 'open-source', source: this.view.source });
      }
    });
  }

  render(view: ComponentPanelView | undefined): void {
    this.view = view;
    query<HTMLElement>(this.root, '.component__empty').hidden = view !== undefined;
    query<HTMLElement>(this.root, '.component__details').hidden = view === undefined;
    if (!view) {
      return;
    }
    query(this.root, '.component__name').textContent = `<${view.name}>`;
    const source = query<HTMLButtonElement>(this.root, '.component__source');
    source.textContent = view.location ?? 'source unavailable';
    source.disabled = view.source === undefined;
    query(this.root, '.component__props-title').textContent = `Props (${view.props.length})`;
    query(this.root, '.component__props').replaceChildren(...view.props.flatMap(({ name, value }) => this.pair(name, value)));
    query(this.root, '.component__owners').replaceChildren(...view.owners.map((owner, index) => element('li', index === 0 ? 'owner owner--selected' : 'owner', owner)));
  }

  private pair(name: string, value: string): HTMLElement[] {
    const term = element('dt', 'pairs__label', name);
    const detail = element('dd', 'pairs__value', value);
    detail.title = 'Click to copy';
    detail.addEventListener('click', () => this.post({ type: 'copy', text: value }));
    return [term, detail];
  }
}
