import type { StoragePanelState } from '../../shared/toolsProtocol';
import type { StorageEntry } from '../../storage/types';
import { query } from '../dom';
import { KeyList } from './KeyList';
import { NewKeyForm } from './NewKeyForm';
import type { PostToolsMessage } from '../types';
import { ValueEditor } from './ValueEditor';

type EmptyKind = Exclude<StoragePanelState['kind'], 'loaded' | 'loading'>;

const EMPTY_TEXTS: Readonly<Record<EmptyKind, readonly [title: string, detail: string]>> = {
  idle: ['No app connected', 'Open a device and start your React Native app in development mode with Metro running.'],
  unavailable: ['AsyncStorage not found', 'This app has not loaded @react-native-async-storage/async-storage yet.'],
  failed: ['Could not read AsyncStorage', ''],
};

export class StoragePanel {
  private readonly keys: KeyList;
  private readonly editor: ValueEditor;
  private readonly form: NewKeyForm;
  private readonly list: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly empty: HTMLElement;
  private entries: readonly StorageEntry[] = [];

  constructor(root: ParentNode, post: PostToolsMessage) {
    this.list = query(root, '.keys');
    this.summary = query(root, '.summary');
    this.empty = query(root, '.empty');
    this.editor = new ValueEditor(query(root, '.editor'), post);
    this.keys = new KeyList(this.list, this.summary, query(root, '.search'), (entry) => this.editor.show(entry, true));
    this.form = new NewKeyForm(query(root, '.new-key'), (key) => this.entries.some((entry) => entry.key === key), post);
    query<HTMLButtonElement>(root, '.add').addEventListener('click', () => this.form.toggle());
    query<HTMLButtonElement>(root, '.empty__retry').addEventListener('click', () => post({ type: 'storage-refresh' }));
  }

  render(state: StoragePanelState): void {
    if (state.kind === 'loading') {
      this.summary.textContent = 'Refreshing…';
      return;
    }
    this.renderSettled(state);
  }

  saved(key: string): void {
    if (this.form.created(key)) {
      this.keys.select(key);
      return;
    }
    const entry = this.entries.find((candidate) => candidate.key === key);
    this.editor.show(entry, true);
    this.editor.saved();
  }

  openNewKeyForm(): void {
    this.form.open();
  }

  private renderSettled(state: Exclude<StoragePanelState, { kind: 'loading' }>): void {
    const loaded = state.kind === 'loaded';
    this.list.hidden = !loaded;
    this.summary.hidden = !loaded;
    this.empty.hidden = loaded;
    if (!loaded) {
      this.showEmpty(state);
      return;
    }
    this.entries = state.entries;
    this.keys.update(state.entries);
    const selected = state.entries.find(({ key }) => key === this.keys.selectedKey);
    this.editor.show(selected, false);
  }

  private showEmpty(state: Exclude<StoragePanelState, { kind: 'loaded' | 'loading' }>): void {
    const [title, detail] = EMPTY_TEXTS[state.kind];
    query(this.empty, '.empty__title').textContent = title;
    query(this.empty, '.empty__detail').textContent = state.kind === 'failed' ? state.message : detail;
    query<HTMLButtonElement>(this.empty, '.empty__retry').hidden = state.kind === 'idle';
    this.entries = [];
    this.editor.show(undefined, true);
  }
}
