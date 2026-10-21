import { query } from '../dom';
import type { PostToolsMessage } from '../types';

export class NewKeyForm {
  private readonly key: HTMLInputElement;
  private readonly value: HTMLTextAreaElement;
  private readonly error: HTMLElement;
  private pending: string | undefined;

  constructor(
    private readonly form: HTMLFormElement,
    private readonly hasKey: (key: string) => boolean,
    post: PostToolsMessage,
  ) {
    this.key = query(form, '.new-key__key');
    this.value = query(form, '.new-key__value');
    this.error = query(form, '.new-key__error');
    query<HTMLButtonElement>(form, '.new-key__cancel').addEventListener('click', () => this.close());
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const key = this.key.value.trim();
      const problem = key === '' ? 'Enter a key.' : this.hasKey(key) ? `"${key}" already exists. Select it to edit.` : undefined;
      this.error.hidden = problem === undefined;
      this.error.textContent = problem ?? '';
      if (problem === undefined) {
        this.pending = key;
        post({ type: 'storage-create', key, value: this.value.value });
      }
    });
  }

  open(): void {
    this.form.hidden = false;
    this.error.hidden = true;
    this.key.focus();
  }

  toggle(): void {
    if (this.form.hidden) {
      this.open();
    } else {
      this.close();
    }
  }

  created(key: string): boolean {
    if (key !== this.pending) {
      return false;
    }
    this.close();
    return true;
  }

  private close(): void {
    this.pending = undefined;
    this.form.hidden = true;
    this.form.reset();
  }
}
