import type { LogLevel, LogLine } from '../../logs/types';
import type { LogsStatus } from '../../shared/toolsProtocol';
import { element, query } from '../dom';
import type { PostToolsMessage } from '../types';

const LEVELS: readonly LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F'];
const JS_TAGS: ReadonlySet<string> = new Set(['ReactNativeJS', 'ReactNative']);
const MAX_LINES = 2_000;
const BOTTOM_SLACK = 24;

const MESSAGES: Readonly<Record<Exclude<LogsStatus['kind'], 'failed' | 'capturing'>, string>> = {
  idle: 'Open a device to see the logs of the app in the foreground.',
  paused: 'Logs paused.',
  'no-app': 'No app in the foreground yet.',
};

export const formatLine = ({ time, level, tag, message }: LogLine): string => `${time} ${level} ${tag}: ${message}`;

export class LogsPanel {
  private lines: LogLine[] = [];
  private status: LogsStatus = { kind: 'idle' };
  private search = '';
  private minLevel = 0;
  private onlyJs = false;
  private paused = false;
  private readonly list: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly post: PostToolsMessage,
  ) {
    this.list = query(root, '.log');
    const search = query<HTMLInputElement>(root, '.logs__search');
    search.addEventListener('input', () => {
      this.search = search.value.trim().toLowerCase();
      this.renderAll();
    });
    const level = query<HTMLSelectElement>(root, '.logs__level');
    level.addEventListener('change', () => {
      this.minLevel = LEVELS.indexOf(level.value as LogLevel);
      this.renderAll();
    });
    const onlyJs = query<HTMLButtonElement>(root, '.logs__js');
    onlyJs.addEventListener('click', () => {
      this.onlyJs = !this.onlyJs;
      onlyJs.setAttribute('aria-pressed', String(this.onlyJs));
      this.renderAll();
    });
    query(root, '.logs__pause').addEventListener('click', () => {
      this.paused = !this.paused;
      this.renderPause();
      post({ type: 'logs-pause', paused: this.paused });
    });
    query(root, '.logs__copy').addEventListener('click', () => post({ type: 'copy', text: this.visible(this.lines).map(formatLine).join('\n') }));
    query(root, '.logs__clear').addEventListener('click', () => post({ type: 'logs-clear' }));
  }

  setStatus(status: LogsStatus): void {
    this.status = status;
    this.paused = status.kind === 'paused';
    this.renderPause();
    this.renderSummary();
  }

  add(lines: readonly LogLine[], reset: boolean): void {
    if (reset) {
      this.lines = [];
      this.list.replaceChildren();
    }
    const stick = this.isAtBottom();
    this.lines = [...this.lines, ...lines].slice(-MAX_LINES);
    this.list.append(...this.visible(lines).map((line) => this.row(line)));
    while (this.list.childElementCount > MAX_LINES) {
      (this.list.firstElementChild as Element).remove();
    }
    this.renderSummary();
    if (stick) {
      this.list.scrollTop = this.list.scrollHeight;
    }
  }

  private visible(lines: readonly LogLine[]): LogLine[] {
    return lines.filter(
      (line) =>
        LEVELS.indexOf(line.level) >= this.minLevel &&
        (!this.onlyJs || JS_TAGS.has(line.tag)) &&
        (this.search === '' || `${line.tag} ${line.message}`.toLowerCase().includes(this.search)),
    );
  }

  private isAtBottom(): boolean {
    return this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight <= BOTTOM_SLACK;
  }

  private renderAll(): void {
    this.list.replaceChildren(...this.visible(this.lines).map((line) => this.row(line)));
    this.list.scrollTop = this.list.scrollHeight;
    this.renderSummary();
  }

  private renderPause(): void {
    const button = query<HTMLButtonElement>(this.root, '.logs__pause');
    const label = this.paused ? 'Resume logs' : 'Pause logs';
    button.title = label;
    button.setAttribute('aria-label', label);
    query(button, '.codicon').className = `codicon ${this.paused ? 'codicon-debug-start' : 'codicon-debug-pause'}`;
  }

  private renderSummary(): void {
    const shown = this.list.childElementCount;
    const total = this.lines.length;
    const lines = shown === total ? `${total} lines` : `${shown} of ${total} lines`;
    query(this.root, '.logs__summary').textContent = this.status.kind === 'capturing' ? `${this.status.app} · ${lines}` : total > 0 ? lines : '';
    query<HTMLElement>(this.root, '.logs__empty').hidden = total > 0;
    query(this.root, '.logs__message').textContent =
      this.status.kind === 'failed' ? this.status.message : this.status.kind === 'capturing' ? `Waiting for logs from ${this.status.app}…` : MESSAGES[this.status.kind];
  }

  private row(line: LogLine): HTMLElement {
    const row = element('li', `log-line level--${line.level}`);
    row.append(element('span', 'log-line__time', line.time.slice(6)), element('span', 'log-line__level', line.level), element('span', 'log-line__tag', line.tag), element('span', 'log-line__message', line.message));
    return row;
  }
}
