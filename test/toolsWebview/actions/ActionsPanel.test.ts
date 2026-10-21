// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { parseActionsState } from '../../../src/appActions/deviceCommands';
import type { ActionsState, ToolsToHostMessage } from '../../../src/shared/toolsProtocol';
import { renderToolsHtml } from '../../../src/tools/toolsHtml';
import { ActionsPanel } from '../../../src/toolsWebview/actions/ActionsPanel';
import { query } from '../../../src/toolsWebview/dom';
import { ACTIONS_STATE_OUTPUT } from '../../appActions/fixtures';

const READY = { kind: 'ready', ...parseActionsState(ACTIONS_STATE_OUTPUT), links: ['mobilidade://trip/42'], wirelessAdb: false } as const;

describe('ActionsPanel', () => {
  let posted: ToolsToHostMessage[];
  let panel: ActionsPanel;
  const $ = <T extends Element>(selector: string) => query<T>(query(document, '.app-actions'), selector);
  const actions = () => posted.map((message) => (message.type === 'actions-run' ? message.action : message));
  const change = (selector: string, value: string) => {
    const select = $<HTMLSelectElement>(selector);
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };

  beforeEach(() => {
    const html = renderToolsHtml({ cspSource: 's', scriptUri: 'x.js', styleUri: 'x.css' });
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<script[^>]*><\/script>/, '');
    posted = [];
    panel = new ActionsPanel(query(document, '.app-actions'), (message) => posted.push(message));
  });

  it('explains when there is no device or the device failed', () => {
    panel.render({ kind: 'idle' });
    expect([$<HTMLElement>('.actions__content').hidden, $('.actions__message').textContent]).toEqual([true, 'Open a device to run actions on it.']);
    panel.render({ kind: 'failed', message: 'adb gone' });
    expect($('.actions__message').textContent).toBe('adb gone');
  });

  it('groups permissions with their status and lists the members of larger groups', () => {
    panel.render(READY);
    const groups = [...document.querySelectorAll('.perm')];
    expect(groups.map((group) => [group.querySelector('.perm__label')?.textContent, group.querySelector('.perm__status')?.textContent])).toEqual([
      ['Location', 'Partly allowed'],
      ['Camera', 'Allowed'],
      ['Microphone', 'Allowed'],
      ['Notifications', 'Allowed'],
      ['Contacts', 'Denied'],
      ['Nearby devices', 'Denied'],
    ]);
    const location = groups[0] as HTMLElement;
    expect([query<HTMLInputElement>(location, '.perm__header .switch').indeterminate, query(location, '.perm__count').textContent]).toEqual([true, '3 permissions']);
    expect([...location.querySelectorAll('.perm__item span')].map((item) => item.textContent)).toEqual(['Access fine location', 'Access coarse location', 'Access background location']);
    expect($('.permissions__summary').textContent).toBe('3 not allowed');
  });

  it('shows the app, language, recent links, tiles and battery', () => {
    panel.render({ ...READY, appLocale: 'pt-BR' });
    expect([$('.actions__app').textContent, $<HTMLSelectElement>('.setting-locale').value, $('.battery__state').textContent]).toEqual(['br.com.client.hmlqa', 'pt-BR', '26% · charging']);
    expect([...document.querySelectorAll<HTMLButtonElement>('[data-toggle]')].map((tile) => [tile.dataset.toggle, tile.getAttribute('aria-pressed'), tile.querySelector('.tile__state')?.textContent])).toEqual([
      ['darkMode', 'true', 'On'],
      ['animations', 'true', 'On'],
      ['showTouches', 'false', 'Off'],
      ['layoutBounds', 'false', 'Off'],
      ['wifi', 'true', 'On'],
      ['mobileData', 'true', 'On'],
      ['airplane', 'false', 'Off'],
    ]);
    expect([...document.querySelectorAll('.recent-link__open')].map((link) => link.textContent)).toEqual(['mobilidade://trip/42']);
    expect([...document.querySelectorAll('.setting-battery option')].map((option) => option.textContent)).toEqual(['Real battery', '5% · unplugged', '15% · unplugged', '50% · charging', '100% · full']);
  });

  it('handles an app without permissions, an unknown battery and a Wi-Fi connection', () => {
    panel.render({ ...READY, app: undefined, permissions: [], battery: { level: 80, charging: false }, wirelessAdb: true });
    expect([$('.actions__app').textContent, $<HTMLButtonElement>('.app__restart').disabled, $<HTMLSelectElement>('.setting-locale').disabled, $('.permission-groups').textContent, $('.permissions__summary').textContent, $('.battery__state').textContent]).toEqual(['No app in the foreground', true, true, 'No runtime permissions', '', '80%']);
    expect([$<HTMLButtonElement>('[data-toggle="wifi"]').disabled, $<HTMLButtonElement>('[data-toggle="mobileData"]').disabled, $('[data-toggle="airplane"]').getAttribute('title')]).toEqual([true, false, 'Not available while Reflect is connected over Wi-Fi']);
    panel.render({ ...READY, permissions: READY.permissions.map((permission) => ({ ...permission, granted: true })), battery: { level: undefined, charging: false } });
    expect([$('.permissions__summary').textContent, $('.battery__state').textContent]).toEqual(['all allowed', 'Unknown']);
  });

  it('sends every action', () => {
    panel.render(READY);
    $<HTMLInputElement>('.deep-link__url').value = '  mobilidade://promo  ';
    $<HTMLFormElement>('.deep-link').dispatchEvent(new Event('submit', { cancelable: true }));
    $<HTMLButtonElement>('.recent-link__open').click();
    $<HTMLButtonElement>('.app__restart').click();
    $<HTMLButtonElement>('.app__settings').click();
    $<HTMLButtonElement>('.app__clear').click();
    change('.setting-locale', 'en-US');
    const location = document.querySelectorAll<HTMLInputElement>('.perm__header .switch')[0] as HTMLInputElement;
    location.checked = true;
    location.dispatchEvent(new Event('change'));
    const background = document.querySelectorAll<HTMLInputElement>('.perm__item .switch')[2] as HTMLInputElement;
    background.checked = true;
    background.dispatchEvent(new Event('change'));
    $<HTMLButtonElement>('[data-toggle="darkMode"]').click();
    $<HTMLButtonElement>('[data-toggle="showTouches"]').click();
    change('.setting-font', '1.3');
    change('.setting-battery', 'low');
    $<HTMLButtonElement>('.actions__refresh').click();
    expect(actions()).toEqual([
      { kind: 'deep-link', url: 'mobilidade://promo' },
      { kind: 'deep-link', url: 'mobilidade://trip/42' },
      { kind: 'restart' },
      { kind: 'app-settings' },
      { kind: 'clear-data' },
      { kind: 'app-language', locale: 'en-US' },
      { kind: 'permission', permissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.ACCESS_BACKGROUND_LOCATION'], granted: true },
      { kind: 'permission', permissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'], granted: true },
      { kind: 'toggle', setting: 'darkMode', on: false },
      { kind: 'toggle', setting: 'showTouches', on: true },
      { kind: 'font-scale', scale: 1.3 },
      { kind: 'battery', mode: 'low' },
      { type: 'actions-refresh' },
    ]);
    expect($<HTMLInputElement>('.deep-link__url').value).toBe('mobilidade://trip/42');
  });

  it('shows the result of the last action', () => {
    panel.showResult(false, 'Error: unable to resolve Intent');
    expect([$<HTMLElement>('.actions-result').hidden, $('.actions-result').textContent, $<HTMLElement>('.actions-result').dataset.state]).toEqual([false, 'Error: unable to resolve Intent', 'error']);
    panel.showResult(true, 'Dark mode on');
    expect($<HTMLElement>('.actions-result').dataset.state).toBe('ok');
  });
});
