// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { LogLine } from '../../../src/logs/types';
import type { ToolsToHostMessage } from '../../../src/shared/toolsProtocol';
import { renderToolsHtml } from '../../../src/tools/toolsHtml';
import { query } from '../../../src/toolsWebview/dom';
import { formatLine, LogsPanel } from '../../../src/toolsWebview/logs/LogsPanel';

const line = (id: number, level: LogLine['level'], tag: string, message: string): LogLine => ({ id, time: `10-21 09:00:0${id % 10}.000`, pid: 7, tid: 1, level, tag, message });

const LINES = [line(1, 'D', 'InsetsController', 'hide(ime())'), line(2, 'I', 'ReactNativeJS', 'trip accepted'), line(3, 'W', 'qdgralloc', 'interlaced'), line(4, 'E', 'AndroidRuntime', 'FATAL EXCEPTION\nat Main')];

describe('LogsPanel', () => {
  let posted: ToolsToHostMessage[];
  let panel: LogsPanel;
  const $ = <T extends Element>(selector: string) => query<T>(query(document, '.logs'), selector);
  const messages = () => [...document.querySelectorAll('.log-line__message')].map((cell) => cell.textContent);

  beforeEach(() => {
    const html = renderToolsHtml({ cspSource: 's', scriptUri: 'x.js', styleUri: 'x.css' });
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<script[^>]*><\/script>/, '');
    posted = [];
    panel = new LogsPanel(query(document, '.logs'), (message) => posted.push(message));
  });

  it('explains every status and shows the app name while capturing', () => {
    const texts: unknown[] = [];
    for (const status of [{ kind: 'idle' }, { kind: 'paused' }, { kind: 'no-app' }, { kind: 'failed', message: 'adb gone' }, { kind: 'capturing', app: 'com.app' }] as const) {
      panel.setStatus(status);
      texts.push($('.logs__message').textContent);
    }
    expect(texts).toEqual(['Open a device to see the logs of the app in the foreground.', 'Logs paused.', 'No app in the foreground yet.', 'adb gone', 'Waiting for logs from com.app…']);
    panel.add(LINES, false);
    expect([$('.logs__summary').textContent, $<HTMLElement>('.logs__empty').hidden]).toEqual(['com.app · 4 lines', true]);
    panel.setStatus({ kind: 'paused' });
    expect($('.logs__summary').textContent).toBe('4 lines');
  });

  it('renders lines with time and level, keeping multi-line messages', () => {
    panel.add(LINES, false);
    expect(messages()).toEqual(['hide(ime())', 'trip accepted', 'interlaced', 'FATAL EXCEPTION\nat Main']);
    expect(document.querySelector('.log-line__time')?.textContent).toBe('09:00:01.000');
    expect(document.querySelectorAll('.log-line')[3]?.className).toBe('log-line level--E');
    panel.add([line(5, 'I', 'X', 'new')], true);
    expect(messages()).toEqual(['new']);
  });

  it('filters by text, minimum level and JavaScript only, and copies what is visible', () => {
    panel.add(LINES, false);
    const search = $<HTMLInputElement>('.logs__search');
    search.value = 'TRIP';
    search.dispatchEvent(new Event('input'));
    expect(messages()).toEqual(['trip accepted']);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    const level = $<HTMLSelectElement>('.logs__level');
    level.value = 'W';
    level.dispatchEvent(new Event('change'));
    expect([messages(), $('.logs__summary').textContent]).toEqual([['interlaced', 'FATAL EXCEPTION\nat Main'], '2 of 4 lines']);
    panel.add([line(6, 'D', 'Hidden', 'debug noise')], false);
    expect(messages()).toHaveLength(2);
    level.value = 'V';
    level.dispatchEvent(new Event('change'));
    $<HTMLButtonElement>('.logs__js').click();
    expect([messages(), $('.logs__js').getAttribute('aria-pressed')]).toEqual([['trip accepted'], 'true']);
    $<HTMLButtonElement>('.logs__copy').click();
    $<HTMLButtonElement>('.logs__js').click();
    expect(messages()).toHaveLength(5);
    expect(posted).toEqual([{ type: 'copy', text: formatLine(LINES[1] as LogLine) }]);
    expect(formatLine(LINES[1] as LogLine)).toBe('10-21 09:00:02.000 I ReactNativeJS: trip accepted');
  });

  it('follows new lines only while scrolled to the bottom and caps the list', () => {
    const list = $<HTMLElement>('.log');
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 500 });
    list.scrollTop = 400;
    panel.add(LINES, false);
    expect(list.scrollTop).toBe(500);
    list.scrollTop = 0;
    panel.add([line(7, 'I', 'X', 'later')], false);
    expect(list.scrollTop).toBe(0);
    panel.add(Array.from({ length: 2_005 }, (_, index) => line(100 + index, 'I', 'X', `m${index}`)), false);
    expect(document.querySelectorAll('.log-line')).toHaveLength(2_000);
  });

  it('pauses, resumes and clears', () => {
    $<HTMLButtonElement>('.logs__pause').click();
    expect([$('.logs__pause').getAttribute('aria-label'), $('.logs__pause .codicon').className]).toEqual(['Resume logs', 'codicon codicon-debug-start']);
    $<HTMLButtonElement>('.logs__pause').click();
    $<HTMLButtonElement>('.logs__clear').click();
    expect(posted).toEqual([{ type: 'logs-pause', paused: true }, { type: 'logs-pause', paused: false }, { type: 'logs-clear' }]);
  });
});
