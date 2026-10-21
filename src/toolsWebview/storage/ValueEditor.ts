import { imageSourceOf, jsonProblem, KIND_LABELS, toEditableText, toStoredText, valueKind } from '../../storage/storageValue';
import type { StorageValueKind } from '../../storage/storageValue';
import type { StorageEntry } from '../../storage/types';
import { query } from '../dom';
import type { PostToolsMessage } from '../types';

const UNSAVED = 'Unsaved changes · Ctrl/Cmd+S to save';

export class ValueEditor {
  private entry: StorageEntry | undefined;
  private dirty = false;
  private editing = false;
  private kind: StorageValueKind = 'string';
  private readonly value: HTMLTextAreaElement;
  private readonly hint: HTMLElement;
  private readonly preview: HTMLElement;
  private readonly image: HTMLImageElement;
  private readonly caption: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly post: PostToolsMessage,
  ) {
    this.value = query(root, '.editor__value');
    this.hint = query(root, '.editor__hint');
    this.preview = query(root, '.preview');
    this.image = query(root, '.preview__image');
    this.caption = query(root, '.preview__caption');
    this.image.addEventListener('load', () => {
      this.caption.textContent = `${this.image.naturalWidth} × ${this.image.naturalHeight}`;
    });
    this.image.addEventListener('error', () => {
      this.caption.textContent = 'Could not load this image';
    });
    this.value.addEventListener('input', () => {
      this.markDirty();
      this.updatePreview();
    });
    this.value.addEventListener('keydown', (event) => {
      if (this.editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        this.save();
      }
    });
    query<HTMLButtonElement>(root, '.editor__edit').addEventListener('click', () => this.setEditing(true));
    query<HTMLButtonElement>(root, '.editor__cancel').addEventListener('click', () => this.show(this.entry, true));
    query<HTMLButtonElement>(root, '.editor__save').addEventListener('click', () => this.save());
    query<HTMLButtonElement>(root, '.editor__copy').addEventListener('click', () => this.post({ type: 'copy', text: this.value.value }));
    query<HTMLButtonElement>(root, '.editor__delete').addEventListener('click', () => this.entry && this.post({ type: 'storage-delete', key: this.entry.key }));
  }

  show(entry: StorageEntry | undefined, force: boolean): void {
    if (this.dirty && !force && entry?.key === this.entry?.key) {
      return;
    }
    this.entry = entry;
    this.root.hidden = entry === undefined;
    if (!entry) {
      return;
    }
    query(this.root, '.editor__key').textContent = entry.key;
    this.kind = valueKind(entry.value);
    query(this.root, '.editor__type').textContent = KIND_LABELS[this.kind];
    this.value.value = toEditableText(entry.value);
    this.dirty = false;
    this.setEditing(false);
    this.updatePreview();
  }

  saved(): void {
    this.dirty = false;
    this.setEditing(false);
    this.hint.textContent = 'Saved';
    this.hint.dataset.state = 'saved';
  }

  private setEditing(editing: boolean): void {
    this.editing = editing;
    this.value.readOnly = !editing;
    this.root.dataset.mode = editing ? 'edit' : 'view';
    query<HTMLElement>(this.root, '.editor__edit').hidden = editing;
    query<HTMLElement>(this.root, '.editor__save').hidden = !editing;
    query<HTMLElement>(this.root, '.editor__cancel').hidden = !editing;
    query<HTMLElement>(this.root, '.editor__delete').hidden = editing;
    this.hint.textContent = editing ? 'Editing · Ctrl/Cmd+S to save, Cancel to discard' : '';
    this.hint.dataset.state = '';
    if (editing) {
      this.value.focus();
    }
  }

  private updatePreview(): void {
    const source = imageSourceOf(this.value.value);
    this.preview.hidden = source === undefined;
    if (source !== undefined && this.image.getAttribute('src') !== source) {
      this.caption.textContent = 'Loading preview…';
      this.image.src = source;
    }
  }

  private markDirty(): void {
    this.dirty = true;
    const problem = this.kind === 'object' || this.kind === 'array' ? jsonProblem(this.value.value) : undefined;
    this.hint.textContent = problem ? `Invalid JSON: ${problem}. It will be saved as text.` : UNSAVED;
    this.hint.dataset.state = problem ? 'warning' : 'dirty';
  }

  private save(): void {
    if (this.entry) {
      this.post({ type: 'storage-save', key: this.entry.key, value: toStoredText(this.entry.value, this.value.value) });
    }
  }
}
