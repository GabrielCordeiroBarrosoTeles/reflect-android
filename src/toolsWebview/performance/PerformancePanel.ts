import type { PerformancePoint } from '../../performance/types';
import type { PerformanceStatus } from '../../shared/toolsProtocol';
import { element, query } from '../dom';
import type { PostToolsMessage } from '../types';
import { createSparkline, drawSparkline } from './Sparkline';
import type { SparklineScale } from './Sparkline';

interface Metric {
  readonly id: string;
  readonly label: string;
  readonly value: (point: PerformancePoint) => number | undefined;
  readonly format: (value: number) => string;
  readonly scale: SparklineScale;
  readonly warnAbove: number | undefined;
}

const METRICS: readonly Metric[] = [
  { id: 'cpu', label: 'CPU', value: (point) => point.cpu, format: (value) => `${value}%`, scale: { floor: 0, ceiling: 100 }, warnAbove: 50 },
  { id: 'memory', label: 'Memory', value: (point) => point.memoryMb, format: (value) => `${value} MB`, scale: { floor: Number.POSITIVE_INFINITY, ceiling: undefined }, warnAbove: undefined },
  { id: 'fps', label: 'Frames / s', value: (point) => point.fps, format: (value) => String(value), scale: { floor: 0, ceiling: 60 }, warnAbove: undefined },
  { id: 'jank', label: 'Janky frames', value: (point) => point.jank, format: (value) => `${value}%`, scale: { floor: 0, ceiling: 100 }, warnAbove: 10 },
];

const MAX_POINTS = 60;
const EMPTY_VALUE = '—';

const MESSAGES: Readonly<Record<Exclude<PerformanceStatus['kind'], 'failed' | 'sampling'>, string>> = {
  idle: 'Open a device to measure the app in the foreground.',
  paused: 'Measuring paused.',
  'no-app': 'No app in the foreground yet.',
};

export class PerformancePanel {
  private points: PerformancePoint[] = [];
  private status: PerformanceStatus = { kind: 'idle' };
  private paused = false;
  private readonly cards = new Map<string, { readonly value: HTMLElement; readonly card: HTMLElement; readonly spark: SVGSVGElement }>();

  constructor(
    private readonly root: HTMLElement,
    post: PostToolsMessage,
  ) {
    const grid = query(root, '.metrics__grid');
    for (const metric of METRICS) {
      const card = element('div', `metric metric--${metric.id}`);
      const value = element('span', 'metric__value', EMPTY_VALUE);
      const spark = createSparkline();
      card.append(element('span', 'metric__label', metric.label), value, spark);
      grid.append(card);
      this.cards.set(metric.id, { value, card, spark });
    }
    query(root, '.perf__pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.renderPause();
      post({ type: 'performance-pause', paused: this.paused });
    });
    query(root, '.perf__reset').addEventListener('click', () => post({ type: 'performance-reset' }));
  }

  setStatus(status: PerformanceStatus): void {
    this.status = status;
    this.paused = status.kind === 'paused';
    this.renderPause();
    this.render();
  }

  add(points: readonly PerformancePoint[], reset: boolean): void {
    this.points = [...(reset ? [] : this.points), ...points].slice(-MAX_POINTS);
    this.render();
  }

  private renderPause(): void {
    const button = query<HTMLButtonElement>(this.root, '.perf__pause');
    const label = this.paused ? 'Resume' : 'Pause';
    button.title = label;
    button.setAttribute('aria-label', label);
    query(button, '.codicon').className = `codicon ${this.paused ? 'codicon-debug-start' : 'codicon-debug-pause'}`;
  }

  private render(): void {
    const latest = this.points.at(-1);
    query<HTMLElement>(this.root, '.perf__empty').hidden = latest !== undefined;
    query<HTMLElement>(this.root, '.metrics').hidden = latest === undefined;
    query(this.root, '.perf__summary').textContent = this.status.kind === 'sampling' ? this.status.app : '';
    query(this.root, '.perf__message').textContent = this.status.kind === 'failed' ? this.status.message : this.status.kind === 'sampling' ? `Measuring ${this.status.app}…` : MESSAGES[this.status.kind];
    if (!latest) {
      return;
    }
    for (const metric of METRICS) {
      const { value, card, spark } = this.cards.get(metric.id) as { value: HTMLElement; card: HTMLElement; spark: SVGSVGElement };
      const current = metric.value(latest);
      value.textContent = current === undefined ? EMPTY_VALUE : metric.format(current);
      card.classList.toggle('metric--warn', current !== undefined && metric.warnAbove !== undefined && current > metric.warnAbove);
      drawSparkline(spark, this.points.map(metric.value), metric.scale);
    }
    const percentiles = [
      ['p50', latest.p50],
      ['p90', latest.p90],
      ['p99', latest.p99],
    ].filter((entry): entry is [string, number] => entry[1] !== undefined);
    query(this.root, '.perf__percentiles').textContent =
      percentiles.length === 0 ? 'Frame times appear while the app draws on screen.' : `Frame time ${percentiles.map(([name, value]) => `${name} ${value} ms`).join(' · ')}`;
  }
}
