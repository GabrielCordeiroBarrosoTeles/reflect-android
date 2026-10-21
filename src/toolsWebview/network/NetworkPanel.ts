import { toCurl } from '../../network/curl';
import type { NetworkEntry } from '../../network/types';
import type { NetworkStatus } from '../../shared/toolsProtocol';
import { imageSourceOf } from '../../storage/storageValue';
import { element, query } from '../dom';
import type { PostToolsMessage } from '../types';
import { durationLabel, hostOf, matchesStatus, pathOf, prettyBody, sizeLabel, statusClass, statusLabel } from './requestFormat';
import type { StatusFilter } from './requestFormat';

type Section = 'headers' | 'request' | 'response';

const MESSAGES: Readonly<Record<NetworkStatus['kind'], string>> = {
  idle: 'Open a device with your app in development mode.',
  capturing: 'Waiting for requests. Use the app to see them here.',
  paused: 'Capture paused.',
  unavailable: 'This app does not expose XMLHttpRequest, so requests cannot be captured.',
  failed: '',
};

export class NetworkPanel {
  private readonly entries = new Map<number, NetworkEntry>();
  private status: NetworkStatus = { kind: 'idle' };
  private search = '';
  private filter: StatusFilter = 'all';
  private selected: number | undefined;
  private section: Section = 'response';
  private paused = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly post: PostToolsMessage,
  ) {
    const search = query<HTMLInputElement>(root, '.network__search');
    search.addEventListener('input', () => {
      this.search = search.value.trim().toLowerCase();
      this.renderList();
    });
    const filter = query<HTMLSelectElement>(root, '.network__filter');
    filter.addEventListener('change', () => {
      this.filter = filter.value as StatusFilter;
      this.renderList();
    });
    query(root, '.network__pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.renderPause();
      post({ type: 'network-pause', paused: this.paused });
    });
    query(root, '.network__clear').addEventListener('click', () => post({ type: 'network-clear' }));
    root.querySelectorAll<HTMLButtonElement>('.segment').forEach((button) =>
      button.addEventListener('click', () => {
        this.section = button.dataset.section as Section;
        this.renderDetail();
      }),
    );
    query(root, '.request__curl').addEventListener('click', () => this.withSelected((entry) => post({ type: 'copy', text: toCurl(entry) })));
    query(root, '.request__copy').addEventListener('click', () => this.withSelected((entry) => post({ type: 'copy', text: entry.responseBody?.text ?? '' })));
  }

  setStatus(status: NetworkStatus): void {
    this.status = status;
    this.paused = status.kind === 'paused';
    this.renderPause();
    this.renderList();
  }

  update(entries: readonly NetworkEntry[], reset: boolean): void {
    if (reset) {
      this.entries.clear();
    }
    entries.forEach((entry) => this.entries.set(entry.id, entry));
    this.renderList();
  }

  private visible(): NetworkEntry[] {
    return [...this.entries.values()]
      .filter((entry) => matchesStatus(entry, this.filter) && entry.url.toLowerCase().includes(this.search))
      .sort((a, b) => b.id - a.id);
  }

  private renderPause(): void {
    const button = query<HTMLButtonElement>(this.root, '.network__pause');
    const label = this.paused ? 'Resume capture' : 'Pause capture';
    button.title = label;
    button.setAttribute('aria-label', label);
    query(button, '.codicon').className = `codicon ${this.paused ? 'codicon-debug-start' : 'codicon-debug-pause'}`;
  }

  private renderList(): void {
    const visible = this.visible();
    const total = this.entries.size;
    query(this.root, '.network__summary').textContent = total === 0 ? '' : visible.length === total ? `${total} requests` : `${visible.length} of ${total} requests`;
    const empty = query<HTMLElement>(this.root, '.network__empty');
    empty.hidden = total > 0;
    query(this.root, '.network__message').textContent = this.status.kind === 'failed' ? this.status.message : MESSAGES[this.status.kind];
    query(this.root, '.requests').replaceChildren(...visible.map((entry) => this.row(entry)));
    if (this.selected !== undefined && !this.entries.has(this.selected)) {
      this.selected = undefined;
    }
    this.renderDetail();
  }

  private row(entry: NetworkEntry): HTMLElement {
    const row = element('li', 'request-row');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(entry.id === this.selected));
    row.title = entry.url;
    const path = element('span', 'request-row__path', pathOf(entry.url));
    path.append(element('small', 'request-row__host', hostOf(entry.url)));
    row.append(
      element('span', `request-row__method method--${entry.method.toLowerCase()}`, entry.method),
      path,
      element('span', `request-row__status status--${statusClass(entry)}`, statusLabel(entry)),
      element('span', 'request-row__time', durationLabel(entry)),
    );
    row.addEventListener('click', () => {
      this.selected = entry.id;
      this.renderList();
    });
    return row;
  }

  private withSelected(action: (entry: NetworkEntry) => void): void {
    const entry = this.selected === undefined ? undefined : this.entries.get(this.selected);
    if (entry) {
      action(entry);
    }
  }

  private renderDetail(): void {
    const detail = query<HTMLElement>(this.root, '.request');
    const entry = this.selected === undefined ? undefined : this.entries.get(this.selected);
    detail.hidden = entry === undefined;
    if (!entry) {
      return;
    }
    query(detail, '.request__method').textContent = entry.method;
    query(detail, '.request__url').textContent = entry.url;
    query(detail, '.request__meta').textContent = [statusLabel(entry), durationLabel(entry), sizeLabel(entry)].filter(Boolean).join(' · ');
    detail.querySelectorAll<HTMLButtonElement>('.segment').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.section === this.section)));
    query(detail, '.request__body').replaceChildren(...this.sectionContent(entry));
  }

  private sectionContent(entry: NetworkEntry): HTMLElement[] {
    switch (this.section) {
      case 'headers':
        return [...this.headers('Request headers', entry.requestHeaders), ...this.headers('Response headers', entry.responseHeaders)];
      case 'request':
        return [this.body(entry.requestBody.text, entry.requestBody.truncated, 'No request body')];
      case 'response':
        return this.response(entry);
    }
  }

  private response(entry: NetworkEntry): HTMLElement[] {
    const image = imageSourceOf(entry.url);
    if (entry.responseBody?.text === '[image]' && image) {
      const figure = element('figure', 'preview');
      const img = element('img', 'preview__image');
      img.src = image;
      img.alt = 'Response image';
      figure.append(img);
      return [figure];
    }
    return [this.body(entry.responseBody?.text ?? '', entry.responseBody?.truncated === true, entry.state === 'pending' ? 'Waiting for the response…' : 'No response body')];
  }

  private headers(title: string, headers: Readonly<Record<string, string>>): HTMLElement[] {
    const pairs = element('dl', 'pairs');
    pairs.append(...Object.entries(headers).flatMap(([name, value]) => [element('dt', 'pairs__label', name), element('dd', 'pairs__value', value)]));
    return [element('h3', 'subtitle', title), Object.keys(headers).length === 0 ? element('p', 'muted', 'None') : pairs];
  }

  private body(text: string, truncated: boolean, emptyText: string): HTMLElement {
    if (text === '') {
      return element('p', 'muted', emptyText);
    }
    const block = element('div', 'code-block');
    block.append(element('pre', 'code', prettyBody(text)));
    if (truncated) {
      block.append(element('p', 'muted', 'Truncated to the first 256 KB.'));
    }
    return block;
  }
}
