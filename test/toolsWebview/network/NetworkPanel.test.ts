// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { NetworkEntry } from '../../../src/network/types';
import type { ToolsToHostMessage } from '../../../src/shared/toolsProtocol';
import { renderToolsHtml } from '../../../src/tools/toolsHtml';
import { query } from '../../../src/toolsWebview/dom';
import { NetworkPanel } from '../../../src/toolsWebview/network/NetworkPanel';
import { durationLabel, hostOf, isFailed, matchesStatus, pathOf, sizeLabel, statusClass, statusLabel } from '../../../src/toolsWebview/network/requestFormat';

const entry = (overrides: Partial<NetworkEntry> = {}): NetworkEntry => ({
  id: 1,
  method: 'GET',
  url: 'https://api.example.com/v2/trips?city=fortaleza',
  state: 'done',
  status: 200,
  startedAt: 0,
  duration: 120,
  requestHeaders: { Authorization: 'Bearer x' },
  requestBody: { text: '', truncated: false },
  responseHeaders: { 'content-type': 'application/json' },
  responseBody: { text: '{"ok":true}', truncated: false },
  responseSize: 1536,
  ...overrides,
});

describe('request format', () => {
  it('labels, classifies and filters requests', () => {
    const failed = entry({ state: 'timeout', status: 0 });
    const pending = entry({ state: 'pending', status: 0, duration: undefined, responseSize: undefined });
    const blocked = entry({ status: 0 });
    expect([isFailed(entry()), isFailed(failed), isFailed(blocked), isFailed(pending)]).toEqual([false, true, true, false]);
    expect([statusLabel(entry()), statusLabel(failed), statusLabel(pending)]).toEqual(['200', 'TIMEOUT', '…']);
    expect([statusClass(entry({ status: 404 })), statusClass(failed), statusClass(pending)]).toEqual(['s4xx', 'failed', 'pending']);
    expect([matchesStatus(entry(), 'all'), matchesStatus(entry(), '2'), matchesStatus(entry(), '4'), matchesStatus(failed, 'failed'), matchesStatus(entry(), 'failed'), matchesStatus(pending, '2')]).toEqual([true, true, false, true, false, false]);
    expect([pathOf('https://a.com/x?y=1'), pathOf('https://a.com'), pathOf('relative/path'), hostOf('https://a.com:8080/x'), hostOf('nope')]).toEqual(['/x?y=1', 'https://a.com', 'relative/path', 'a.com:8080', '']);
    expect([durationLabel(entry()), durationLabel(pending), sizeLabel(entry()), sizeLabel(pending)]).toEqual(['120 ms', '', '1.5 KB', '']);
  });
});

describe('NetworkPanel', () => {
  let posted: ToolsToHostMessage[];
  let panel: NetworkPanel;
  const $ = <T extends Element>(selector: string) => query<T>(query(document, '.network'), selector);
  const rows = () => [...document.querySelectorAll('.request-row__path')].map((row) => row.firstChild?.textContent);

  beforeEach(() => {
    const html = renderToolsHtml({ cspSource: 's', scriptUri: 'x.js', styleUri: 'x.css' });
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<script[^>]*><\/script>/, '');
    posted = [];
    panel = new NetworkPanel(query(document, '.network'), (message) => posted.push(message));
  });

  it('explains every status while empty', () => {
    const texts: unknown[] = [];
    for (const status of [{ kind: 'idle' }, { kind: 'capturing' }, { kind: 'paused' }, { kind: 'unavailable' }, { kind: 'failed', message: 'Metro down' }] as const) {
      panel.setStatus(status);
      texts.push($('.network__message').textContent);
    }
    expect(texts).toEqual([
      'Open a device with your app in development mode.',
      'Waiting for requests. Use the app to see them here.',
      'Capture paused.',
      'This app does not expose XMLHttpRequest, so requests cannot be captured.',
      'Metro down',
    ]);
    expect([$<HTMLElement>('.network__empty').hidden, $('.network__summary').textContent]).toEqual([false, '']);
  });

  it('lists requests newest first and filters by URL and status', () => {
    panel.update([entry(), entry({ id: 2, method: 'POST', url: 'https://api.example.com/v2/login', status: 401 }), entry({ id: 3, url: 'https://cdn.example.com/logo.png' })], false);
    expect(rows()).toEqual(['/logo.png', '/v2/login', '/v2/trips?city=fortaleza']);
    expect([$('.network__summary').textContent, $<HTMLElement>('.network__empty').hidden]).toEqual(['3 requests', true]);
    const search = $<HTMLInputElement>('.network__search');
    search.value = ' API ';
    search.dispatchEvent(new Event('input'));
    expect(rows()).toEqual(['/v2/login', '/v2/trips?city=fortaleza']);
    const filter = $<HTMLSelectElement>('.network__filter');
    filter.value = '4';
    filter.dispatchEvent(new Event('change'));
    expect([rows(), $('.network__summary').textContent]).toEqual([['/v2/login'], '1 of 3 requests']);
    expect(document.querySelector('.request-row__status')?.className).toContain('status--s4xx');
    panel.update([entry({ id: 9, url: 'https://api.example.com/v2/new', status: 404 })], true);
    expect(rows()).toEqual(['/v2/new']);
  });

  it('shows details by section, previews images and copies cURL and responses', () => {
    panel.update([entry({ requestBody: { text: '{"a":1}', truncated: false }, responseBody: { text: '{"big":true}', truncated: true } }), entry({ id: 2, url: 'https://cdn.example.com/logo.png', responseBody: { text: '[image]', truncated: false } })], false);
    $<HTMLButtonElement>('.request__curl').click();
    expect($<HTMLElement>('.request').hidden).toBe(true);
    (document.querySelectorAll<HTMLElement>('.request-row')[1] as HTMLElement).click();
    expect([$('.request__method').textContent, $('.request__meta').textContent, $('.code').textContent]).toEqual(['GET', '200 · 120 ms · 1.5 KB', '{\n  "big": true\n}']);
    expect($('.request__body').textContent).toContain('Truncated to the first 256 KB.');
    const section = (name: string) => (document.querySelector<HTMLButtonElement>(`.segment[data-section="${name}"]`) as HTMLButtonElement).click();
    section('request');
    expect($('.code').textContent).toBe('{\n  "a": 1\n}');
    section('headers');
    expect([...document.querySelectorAll('.request__body .pairs__label')].map((label) => label.textContent)).toEqual(['Authorization', 'content-type']);
    $<HTMLButtonElement>('.request__curl').click();
    $<HTMLButtonElement>('.request__copy').click();
    expect(posted).toEqual([
      { type: 'copy', text: "curl -X GET 'https://api.example.com/v2/trips?city=fortaleza' \\\n  -H 'Authorization: Bearer x' \\\n  --data-raw '{\"a\":1}'" },
      { type: 'copy', text: '{"big":true}' },
    ]);
    (document.querySelectorAll<HTMLElement>('.request-row')[0] as HTMLElement).click();
    section('response');
    expect(document.querySelector<HTMLImageElement>('.request__body img')?.getAttribute('src')).toBe('https://cdn.example.com/logo.png');
    panel.update([], true);
    expect($<HTMLElement>('.request').hidden).toBe(true);
  });

  it('shows empty bodies and pending responses, and copies an empty response', () => {
    panel.update([entry({ state: 'pending', status: 0, duration: undefined, responseSize: undefined, responseBody: undefined, requestHeaders: {}, responseHeaders: {} }), entry({ id: 2, url: 'https://a/b.png', responseBody: { text: '', truncated: false } })], false);
    (document.querySelectorAll<HTMLElement>('.request-row')[1] as HTMLElement).click();
    expect([$('.request__meta').textContent, $('.request__body').textContent]).toEqual(['…', 'Waiting for the response…']);
    $<HTMLButtonElement>('.request__copy').click();
    (document.querySelector<HTMLButtonElement>('.segment[data-section="headers"]') as HTMLButtonElement).click();
    expect($('.request__body').textContent).toBe('Request headersNoneResponse headersNone');
    (document.querySelector<HTMLButtonElement>('.segment[data-section="request"]') as HTMLButtonElement).click();
    expect($('.request__body').textContent).toBe('No request body');
    (document.querySelectorAll<HTMLElement>('.request-row')[0] as HTMLElement).click();
    (document.querySelector<HTMLButtonElement>('.segment[data-section="response"]') as HTMLButtonElement).click();
    expect($('.request__body').textContent).toBe('No response body');
    expect(posted).toEqual([{ type: 'copy', text: '' }]);
  });

  it('pauses and resumes capture and clears', () => {
    $<HTMLButtonElement>('.network__pause').click();
    expect([$('.network__pause').getAttribute('aria-label'), $('.network__pause .codicon').className]).toEqual(['Resume capture', 'codicon codicon-debug-start']);
    $<HTMLButtonElement>('.network__pause').click();
    panel.setStatus({ kind: 'paused' });
    expect($('.network__pause').getAttribute('aria-label')).toBe('Resume capture');
    $<HTMLButtonElement>('.network__clear').click();
    expect(posted).toEqual([{ type: 'network-pause', paused: true }, { type: 'network-pause', paused: false }, { type: 'network-clear' }]);
  });
});
