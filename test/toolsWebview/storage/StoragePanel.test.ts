// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostToToolsMessage, ToolsToHostMessage } from '../../../src/shared/toolsProtocol';
import { renderToolsHtml } from '../../../src/tools/toolsHtml';
import { query } from '../../../src/toolsWebview/dom';
import { StoragePanel } from '../../../src/toolsWebview/storage/StoragePanel';

const ENTRIES = [
  { key: 'auth.token', value: 'abc' },
  { key: 'cart', value: '[1,2]' },
  { key: 'user', value: '{"name":"Ana"}' },
];

const setup = () => {
  const html = renderToolsHtml({ cspSource: 's', scriptUri: 'x.js', styleUri: 'x.css' });
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<script[^>]*><\/script>/, '');
  const posted: ToolsToHostMessage[] = [];
  const panel = new StoragePanel(query(document, '.storage'), (message) => posted.push(message));
  const deliver = (message: HostToToolsMessage) => {
    if (message.type === 'storage-state') panel.render(message.state);
    if (message.type === 'storage-saved') panel.saved(message.key);
    if (message.type === 'storage-new-key') panel.openNewKeyForm();
  };
  const $ = <T extends Element>(selector: string) => query<T>(document, selector);
  const rows = () => [...document.querySelectorAll('.key')].map((row) => row.querySelector('.key__name')?.textContent);
  const type = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  return { posted, deliver, $, rows, type };
};

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('StoragePanel', () => {
  it('lists keys with type and size, and filters them', () => {
    const { deliver, $, rows, type } = setup();
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    expect(rows()).toEqual(['auth.token', 'cart', 'user']);
    expect($('.summary').textContent).toBe('3 keys');
    expect([...document.querySelectorAll('.key__type')].map((cell) => cell.textContent)).toEqual(['""', '[]', '{}']);
    expect(document.querySelector('.key__size')?.textContent).toBe('3 B');
    type($('.search'), 'US');
    expect(rows()).toEqual(['user']);
    expect($('.summary').textContent).toBe('1 of 3 keys');
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: [ENTRIES[0] as never] } });
    type($('.search'), '');
    expect($('.summary').textContent).toBe('1 key');
  });

  it('opens a key in the editor, warns about invalid JSON and saves with the shortcut', () => {
    const { deliver, $, posted, type } = setup();
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    document.querySelectorAll<HTMLElement>('.key')[2]?.click();
    expect($<HTMLElement>('.editor').hidden).toBe(false);
    expect([$('.editor__key').textContent, $('.editor__type').textContent]).toEqual(['user', 'JSON object']);
    expect($<HTMLTextAreaElement>('.editor__value').value).toBe('{\n  "name": "Ana"\n}');
    expect([$<HTMLTextAreaElement>('.editor__value').readOnly, $<HTMLElement>('.editor__save').hidden, $<HTMLElement>('.editor__edit').hidden]).toEqual([true, true, false]);
    $('.editor__value').dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true }));
    expect(posted).toEqual([]);
    $<HTMLButtonElement>('.editor__edit').click();
    expect([$<HTMLTextAreaElement>('.editor__value').readOnly, $<HTMLElement>('.editor__save').hidden, $<HTMLElement>('.editor__delete').hidden, $('.editor__hint').textContent]).toEqual([false, false, true, 'Editing · Ctrl/Cmd+S to save, Cancel to discard']);
    type($('.editor__value'), '{ "name": ');
    expect($('.editor__hint').textContent).toMatch(/^Invalid JSON: .+ It will be saved as text\.$/);
    type($('.editor__value'), '{\n  "name": "Bia"\n}');
    expect($('.editor__hint').textContent).toBe('Unsaved changes · Ctrl/Cmd+S to save');
    $('.editor__value').dispatchEvent(new KeyboardEvent('keydown', { key: 's', metaKey: true, cancelable: true }));
    $('.editor__value').dispatchEvent(new KeyboardEvent('keydown', { key: 'S', ctrlKey: true, cancelable: true }));
    $('.editor__value').dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(posted).toEqual([
      { type: 'storage-save', key: 'user', value: '{"name":"Bia"}' },
      { type: 'storage-save', key: 'user', value: '{"name":"Bia"}' },
    ]);
    $<HTMLButtonElement>('.editor__copy').click();
    $<HTMLButtonElement>('.editor__save').click();
    $<HTMLButtonElement>('.editor__cancel').click();
    expect([$<HTMLTextAreaElement>('.editor__value').value, $<HTMLTextAreaElement>('.editor__value').readOnly, $<HTMLElement>('.editor__delete').hidden]).toEqual(['{\n  "name": "Ana"\n}', true, false]);
    $<HTMLButtonElement>('.editor__delete').click();
    expect(posted.slice(2)).toEqual([
      { type: 'copy', text: '{\n  "name": "Bia"\n}' },
      { type: 'storage-save', key: 'user', value: '{"name":"Bia"}' },
      { type: 'storage-delete', key: 'user' },
    ]);
  });

  it('keeps unsaved edits across refreshes, then shows the saved value', () => {
    const { deliver, $, type } = setup();
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    document.querySelectorAll<HTMLElement>('.key')[0]?.click();
    $<HTMLButtonElement>('.editor__edit').click();
    type($('.editor__value'), 'abc edited');
    deliver({ type: 'storage-state', state: { kind: 'loading' } });
    expect($('.summary').textContent).toBe('Refreshing…');
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    expect($<HTMLTextAreaElement>('.editor__value').value).toBe('abc edited');
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: [{ key: 'auth.token', value: 'abc edited' }, ...ENTRIES.slice(1)] } });
    deliver({ type: 'storage-saved', key: 'auth.token' });
    expect([$<HTMLTextAreaElement>('.editor__value').value, $('.editor__hint').textContent, $<HTMLTextAreaElement>('.editor__value').readOnly]).toEqual(['abc edited', 'Saved', true]);
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES.slice(1) } });
    expect($<HTMLElement>('.editor').hidden).toBe(true);
  });

  it('previews image values and follows edits', () => {
    const { deliver, $, type } = setup();
    const logo = 'https://minio.example.com/hmlqa/driverLogo.png';
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: [{ key: 'logo', value: logo }, ...ENTRIES] } });
    document.querySelectorAll<HTMLElement>('.key')[1]?.click();
    expect($<HTMLElement>('.preview').hidden).toBe(true);
    document.querySelectorAll<HTMLElement>('.key')[0]?.click();
    const image = $<HTMLImageElement>('.preview__image');
    expect([$<HTMLElement>('.preview').hidden, image.getAttribute('src'), $('.preview__caption').textContent]).toEqual([false, logo, 'Loading preview…']);
    Object.defineProperty(image, 'naturalWidth', { value: 512 });
    Object.defineProperty(image, 'naturalHeight', { value: 128 });
    image.dispatchEvent(new Event('load'));
    expect($('.preview__caption').textContent).toBe('512 × 128');
    type($('.editor__value'), `${logo} `);
    expect($('.preview__caption').textContent).toBe('512 × 128');
    type($('.editor__value'), 'https://minio.example.com/missing.webp');
    image.dispatchEvent(new Event('error'));
    expect($('.preview__caption').textContent).toBe('Could not load this image');
    type($('.editor__value'), 'not an image');
    expect($<HTMLElement>('.preview').hidden).toBe(true);
  });

  it('moves the selection with the arrow keys', () => {
    const { deliver, $ } = setup();
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    const press = (key: string) => $('.keys').dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    press('ArrowDown');
    expect($('.editor__key').textContent).toBe('auth.token');
    press('ArrowDown');
    press('ArrowDown');
    press('ArrowDown');
    expect($('.editor__key').textContent).toBe('user');
    press('ArrowUp');
    press('Enter');
    expect($('.editor__key').textContent).toBe('cart');
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: [] } });
    press('ArrowDown');
    expect($<HTMLElement>('.editor').hidden).toBe(true);
  });

  it('creates keys, refusing empty and duplicate ones', () => {
    const { deliver, $, posted } = setup();
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    $<HTMLButtonElement>('.add').click();
    expect($<HTMLElement>('.new-key').hidden).toBe(false);
    const submit = () => $<HTMLFormElement>('.new-key').dispatchEvent(new Event('submit', { cancelable: true }));
    submit();
    expect($('.new-key__error').textContent).toBe('Enter a key.');
    $<HTMLInputElement>('.new-key__key').value = 'cart';
    submit();
    expect($('.new-key__error').textContent).toBe('"cart" already exists. Select it to edit.');
    $<HTMLInputElement>('.new-key__key').value = '  theme ';
    $<HTMLTextAreaElement>('.new-key__value').value = 'dark';
    submit();
    expect(posted).toEqual([{ type: 'storage-create', key: 'theme', value: 'dark' }]);
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: [...ENTRIES, { key: 'theme', value: 'dark' }] } });
    deliver({ type: 'storage-saved', key: 'theme' });
    expect($<HTMLElement>('.new-key').hidden).toBe(true);
    expect($('.editor__key').textContent).toBe('theme');
  });

  it('opens the form from the host, toggles it and cancels it', () => {
    const { deliver, $ } = setup();
    deliver({ type: 'storage-new-key' });
    expect($<HTMLElement>('.new-key').hidden).toBe(false);
    $<HTMLButtonElement>('.add').click();
    expect($<HTMLElement>('.new-key').hidden).toBe(true);
    $<HTMLButtonElement>('.add').click();
    $<HTMLInputElement>('.new-key__key').value = 'draft';
    $<HTMLButtonElement>('.new-key__cancel').click();
    expect([$<HTMLElement>('.new-key').hidden, $<HTMLInputElement>('.new-key__key').value]).toEqual([true, '']);
  });

  it('ignores saves for keys it is not showing and creations that did not land', () => {
    const { deliver, $, posted } = setup();
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: ENTRIES } });
    deliver({ type: 'storage-saved', key: 'ghost' });
    expect($<HTMLElement>('.editor').hidden).toBe(true);
    $<HTMLButtonElement>('.add').click();
    $<HTMLInputElement>('.new-key__key').value = 'lost';
    $<HTMLFormElement>('.new-key').dispatchEvent(new Event('submit', { cancelable: true }));
    deliver({ type: 'storage-saved', key: 'lost' });
    expect($<HTMLElement>('.editor').hidden).toBe(true);
    $<HTMLButtonElement>('.editor__delete').click();
    $<HTMLButtonElement>('.editor__save').click();
    expect(posted).toEqual([{ type: 'storage-create', key: 'lost', value: '' }]);
  });

  it('shows clear empty states and retries', () => {
    const { deliver, $, posted } = setup();
    deliver({ type: 'storage-state', state: { kind: 'idle' } });
    expect([$('.empty__title').textContent, $<HTMLElement>('.empty__retry').hidden, $<HTMLElement>('.keys').hidden]).toEqual(['No app connected', true, true]);
    deliver({ type: 'storage-state', state: { kind: 'unavailable' } });
    expect($('.empty__title').textContent).toBe('AsyncStorage not found');
    deliver({ type: 'storage-state', state: { kind: 'failed', message: 'Metro is down' } });
    expect([$('.empty__detail').textContent, $<HTMLElement>('.empty__retry').hidden]).toEqual(['Metro is down', false]);
    $<HTMLButtonElement>('.empty__retry').click();
    expect(posted).toEqual([{ type: 'storage-refresh' }]);
    expect(() => query(document, '.missing')).toThrow('Missing element .missing');
  });
});
