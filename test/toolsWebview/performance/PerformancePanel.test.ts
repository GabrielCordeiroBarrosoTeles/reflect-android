// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { PerformancePoint } from '../../../src/performance/types';
import type { ToolsToHostMessage } from '../../../src/shared/toolsProtocol';
import { renderToolsHtml } from '../../../src/tools/toolsHtml';
import { query } from '../../../src/toolsWebview/dom';
import { PerformancePanel } from '../../../src/toolsWebview/performance/PerformancePanel';
import { createSparkline, drawSparkline, sparklinePoints } from '../../../src/toolsWebview/performance/Sparkline';

const point = (overrides: Partial<PerformancePoint> = {}): PerformancePoint => ({ time: 0, cpu: 12.5, memoryMb: 50.3, fps: 58, jank: 3, p50: 9, p90: 17, p99: 41, ...overrides });

describe('Sparkline', () => {
  it('maps values into the chart, skipping gaps', () => {
    expect(sparklinePoints([], { floor: 0, ceiling: 100 })).toBe('');
    expect(sparklinePoints([undefined], { floor: 0, ceiling: 100 })).toBe('');
    expect(sparklinePoints([0, 50, undefined, 100], { floor: 0, ceiling: 100 })).toBe('0.0,28.0 40.0,14.0 120.0,0.0');
    expect(sparklinePoints([5], { floor: 0, ceiling: undefined })).toBe('0.0,0.0');
    expect(sparklinePoints([150, 200], { floor: Number.POSITIVE_INFINITY, ceiling: undefined })).toBe('0.0,28.0 120.0,0.0');
    const svg = createSparkline();
    drawSparkline(svg, [1, 2], { floor: 0, ceiling: 2 });
    expect([svg.getAttribute('viewBox'), svg.querySelector('polyline')?.getAttribute('points')]).toEqual(['0 0 120 28', '0.0,14.0 120.0,0.0']);
  });
});

describe('PerformancePanel', () => {
  let posted: ToolsToHostMessage[];
  let panel: PerformancePanel;
  const $ = <T extends Element>(selector: string) => query<T>(query(document, '.performance'), selector);
  const values = () => [...document.querySelectorAll('.metric__value')].map((value) => value.textContent);

  beforeEach(() => {
    const html = renderToolsHtml({ cspSource: 's', scriptUri: 'x.js', styleUri: 'x.css' });
    document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML.replace(/<script[^>]*><\/script>/, '');
    posted = [];
    panel = new PerformancePanel(query(document, '.performance'), (message) => posted.push(message));
  });

  it('explains every status before the first sample', () => {
    const texts: unknown[] = [];
    for (const status of [{ kind: 'idle' }, { kind: 'paused' }, { kind: 'no-app' }, { kind: 'failed', message: 'adb gone' }, { kind: 'sampling', app: 'com.app' }] as const) {
      panel.setStatus(status);
      texts.push($('.perf__message').textContent);
    }
    expect(texts).toEqual(['Open a device to measure the app in the foreground.', 'Measuring paused.', 'No app in the foreground yet.', 'adb gone', 'Measuring com.app…']);
    expect([$<HTMLElement>('.metrics').hidden, $('.perf__summary').textContent]).toEqual([true, 'com.app']);
  });

  it('shows the latest values, warnings, sparklines and frame time percentiles', () => {
    panel.setStatus({ kind: 'sampling', app: 'com.app' });
    panel.add([point(), point({ cpu: 72, jank: 15 })], false);
    expect([$<HTMLElement>('.metrics').hidden, values()]).toEqual([false, ['72%', '50.3 MB', '58', '15%']]);
    expect([...document.querySelectorAll('.metric--warn')].map((card) => card.className)).toEqual(['metric metric--cpu metric--warn', 'metric metric--jank metric--warn']);
    expect(document.querySelector('.metric--cpu polyline')?.getAttribute('points')).not.toBe('');
    expect($('.perf__percentiles').textContent).toBe('Frame time p50 9 ms · p90 17 ms · p99 41 ms');
    panel.add([point({ cpu: undefined, memoryMb: undefined, fps: undefined, jank: undefined, p50: undefined, p90: undefined, p99: undefined })], true);
    expect([values(), $('.perf__percentiles').textContent, document.querySelectorAll('.metric--warn').length]).toEqual([['—', '—', '—', '—'], 'Frame times appear while the app draws on screen.', 0]);
    panel.add(Array.from({ length: 70 }, (_, index) => point({ cpu: index })), false);
    expect(values()[0]).toBe('69%');
  });

  it('pauses, resumes and resets frame stats', () => {
    $<HTMLButtonElement>('.perf__pause').click();
    expect([$('.perf__pause').getAttribute('aria-label'), $('.perf__pause .codicon').className]).toEqual(['Resume', 'codicon codicon-debug-start']);
    $<HTMLButtonElement>('.perf__pause').click();
    $<HTMLButtonElement>('.perf__reset').click();
    panel.setStatus({ kind: 'paused' });
    expect($('.perf__pause').getAttribute('aria-label')).toBe('Resume');
    expect(posted).toEqual([{ type: 'performance-pause', paused: true }, { type: 'performance-pause', paused: false }, { type: 'performance-reset' }]);
  });
});
