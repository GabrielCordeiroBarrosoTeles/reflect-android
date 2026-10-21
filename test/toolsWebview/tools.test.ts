// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolsTab, ToolsToHostMessage } from '../../src/shared/toolsProtocol';
import { renderToolsHtml } from '../../src/tools/toolsHtml';
import { ComponentTab } from '../../src/toolsWebview/ComponentTab';
import { DeviceTab } from '../../src/toolsWebview/DeviceTab';
import { query } from '../../src/toolsWebview/dom';
import { TabBar } from '../../src/toolsWebview/TabBar';

const load = () => {
  const html = renderToolsHtml({ cspSource: 's', scriptUri: 'x.js', styleUri: 'x.css' });
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<script[^>]*><\/script>/, '');
};

const $ = <T extends Element>(selector: string) => query<T>(document, selector);

beforeEach(load);

describe('TabBar', () => {
  const setup = (saved: unknown) => {
    const states: unknown[] = [];
    const changes: ToolsTab[] = [];
    const bar = new TabBar(document, { get: () => saved, set: (state) => states.push(state) }, (tab) => changes.push(tab));
    const visible = () => [...document.querySelectorAll<HTMLElement>('.panel')].filter((panel) => !panel.hidden).map((panel) => panel.dataset.tab);
    const press = (tab: ToolsTab, key: string) => $(`#tab-${tab}`).dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));
    return { bar, states, changes, visible, press };
  };

  it('starts on Component and switches on click, remembering the choice', () => {
    const { bar, visible, states, changes } = setup(undefined);
    bar.start();
    expect([visible(), bar.current, states]).toEqual([['component'], 'component', []]);
    $<HTMLButtonElement>('#tab-device').click();
    expect([visible(), states.at(-1), changes]).toEqual([['device'], { tab: 'device' }, ['component', 'device']]);
    expect($('#tab-device').getAttribute('aria-selected')).toBe('true');
  });

  it('restores the saved tab once Storage becomes available and falls back when it goes away', () => {
    const { bar, visible } = setup({ tab: 'storage' });
    bar.start();
    expect(visible()).toEqual(['component']);
    bar.setAvailable('storage', true);
    expect(visible()).toEqual(['storage']);
    bar.setAvailable('storage', true);
    bar.setAvailable('storage', false);
    expect([visible(), $<HTMLElement>('#tab-storage').hidden]).toEqual([['component'], true]);
    bar.setAvailable('device', false);
    expect(visible()).toEqual(['component']);
  });

  it('starts on an available saved tab and ignores unknown saved state', () => {
    const device = setup({ tab: 'device' });
    device.bar.start();
    expect(device.visible()).toEqual(['device']);
    load();
    const junk = setup({ tab: 7 });
    junk.bar.start();
    expect(junk.visible()).toEqual(['component']);
    load();
    const nothing = setup(null);
    nothing.bar.start();
    expect(nothing.visible()).toEqual(['component']);
  });

  it('moves between visible tabs with the keyboard', () => {
    const { bar, press } = setup(undefined);
    bar.start();
    press('component', 'ArrowRight');
    expect(bar.current).toBe('device');
    expect(document.activeElement).toBe($('#tab-device'));
    press('device', 'ArrowRight');
    expect(bar.current).toBe('component');
    press('component', 'ArrowLeft');
    press('device', 'Home');
    expect(bar.current).toBe('component');
    bar.setAvailable('storage', true);
    press('component', 'End');
    expect(bar.current).toBe('device');
    press('device', 'ArrowLeft');
    expect(bar.current).toBe('storage');
    press('storage', 'Enter');
    expect(bar.current).toBe('storage');
  });
});

describe('ComponentTab', () => {
  it('shows a hint, then the component with copyable props and its source link', () => {
    const posted: ToolsToHostMessage[] = [];
    const tab = new ComponentTab($('.component'), (message) => posted.push(message));
    $<HTMLButtonElement>('.component__source').click();
    tab.render(undefined);
    expect([$<HTMLElement>('.component__empty').hidden, $<HTMLElement>('.component__details').hidden]).toEqual([false, true]);
    const source = { file: '/app/Demo.tsx', line: 3, column: 1 };
    tab.render({ name: 'Text', location: 'src/Demo.tsx:3', source, props: [{ name: 'children', value: '"Copy"' }], owners: ['Text', 'Demo'] });
    expect([$('.component__name').textContent, $('.component__source').textContent, $('.component__props-title').textContent]).toEqual(['<Text>', 'src/Demo.tsx:3', 'Props (1)']);
    expect([...document.querySelectorAll('.owner')].map((owner) => owner.className)).toEqual(['owner owner--selected', 'owner']);
    $<HTMLButtonElement>('.component__source').click();
    document.querySelector<HTMLElement>('.component__props .pairs__value')?.click();
    tab.render({ name: 'View', location: undefined, source: undefined, props: [], owners: [] });
    expect([$('.component__source').textContent, $<HTMLButtonElement>('.component__source').disabled]).toEqual(['source unavailable', true]);
    $<HTMLButtonElement>('.component__source').click();
    expect(posted).toEqual([
      { type: 'open-source', source },
      { type: 'copy', text: '"Copy"' },
    ]);
  });
});

describe('DeviceTab', () => {
  it('shows messages or grouped details that copy on click', () => {
    const posted: ToolsToHostMessage[] = [];
    const tab = new DeviceTab($('.device'), (message) => posted.push(message));
    tab.render({ kind: 'failed' });
    expect($('.device__message').textContent).toBe('Could not read device info. Use Refresh to try again.');
    tab.render({ kind: 'loaded', groups: [{ label: 'Battery', icon: 'zap', entries: [{ label: 'Level', value: '79%' }] }] });
    expect([$<HTMLElement>('.device__empty').hidden, $('.card__title').textContent, document.querySelector('.codicon-zap') !== null]).toEqual([true, 'Battery', true]);
    document.querySelector<HTMLElement>('.device .pairs__value')?.click();
    expect(posted).toEqual([{ type: 'copy', text: '79%' }]);
    tab.render({ kind: 'idle' });
    expect([$('.device__message').textContent, document.querySelectorAll('.card')]).toEqual(['Open a device to see its details.', expect.objectContaining({ length: 0 })]);
  });
});

describe('tools webview entry', () => {
  it('announces itself, starts the tabs and routes host messages', async () => {
    const posted: ToolsToHostMessage[] = [];
    let state: unknown = { tab: 'device' };
    vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: (message: ToolsToHostMessage) => posted.push(message), getState: () => state, setState: (value: unknown) => (state = value) }));
    vi.resetModules();
    await import('../../src/toolsWebview/main');
    expect(posted).toEqual([{ type: 'ready' }, { type: 'tab-changed', tab: 'device' }]);
    const deliver = (data: unknown) => window.dispatchEvent(new MessageEvent('message', { data }));
    deliver({ type: 'app-available', available: true });
    deliver({ type: 'select-tab', tab: 'storage' });
    deliver({ type: 'component', view: undefined });
    deliver({ type: 'device', state: { kind: 'idle' } });
    deliver({ type: 'storage-state', state: { kind: 'loaded', entries: [{ key: 'a', value: '1' }] } });
    deliver({ type: 'storage-saved', key: 'a' });
    deliver({ type: 'storage-new-key' });
    deliver({ type: 'network-status', status: { kind: 'capturing' } });
    deliver({ type: 'network-entries', reset: true, entries: [] });
    expect(document.querySelector('.network__message')?.textContent).toBe('Waiting for requests. Use the app to see them here.');
    expect([document.querySelector('.storage .summary')?.textContent, $<HTMLElement>('.new-key').hidden, $<HTMLElement>('#panel-storage').hidden]).toEqual(['1 key', false, false]);
    $<HTMLButtonElement>('#tab-component').click();
    expect([posted.at(-1), state]).toEqual([{ type: 'tab-changed', tab: 'component' }, { tab: 'component' }]);
  });
});
