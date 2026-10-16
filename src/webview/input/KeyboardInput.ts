import type { KeyModifiers } from '../../shared/protocol';
import type { FrameScheduler } from './FrameScheduler';
import type { Disposable, InspectModeState, MessageSink } from './types';

const TEXT_TASK = 'keyboard-text';

const FORWARDED_SHORTCUTS = new Set(['KeyA', 'KeyC', 'KeyX', 'KeyZ', 'KeyY']);

const modifiersOf = (event: KeyboardEvent): KeyModifiers => ({
  shift: event.shiftKey,
  alt: event.altKey,
  ctrl: event.ctrlKey,
  meta: event.metaKey,
});

const isPrintable = (event: KeyboardEvent): boolean => event.key.length === 1 && !event.ctrlKey && !event.metaKey;

export class KeyboardInput implements Disposable {
  private pendingText = '';
  private readonly pressedCodes = new Set<string>();
  private readonly abort = new AbortController();

  constructor(
    target: HTMLElement,
    private readonly scheduler: FrameScheduler,
    private readonly send: MessageSink,
    private readonly inspectMode: InspectModeState,
  ) {
    const options = { signal: this.abort.signal };
    target.addEventListener('keydown', (event) => this.handleDown(event), options);
    target.addEventListener('keyup', (event) => this.handleUp(event), options);
    target.addEventListener('blur', () => this.releaseAll(), options);
  }

  dispose(): void {
    this.releaseAll();
    this.abort.abort();
  }

  private handleDown(event: KeyboardEvent): void {
    if (event.isComposing || event.key === 'Dead') {
      return;
    }
    if (this.inspectMode.active && event.code === 'Escape') {
      event.preventDefault();
      this.send({ type: 'inspect-cancel' });
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      this.handleShortcut(event);
      return;
    }
    event.preventDefault();
    if (isPrintable(event)) {
      this.queueText(event.key);
      return;
    }
    this.scheduler.flushNow(TEXT_TASK);
    this.pressedCodes.add(event.code);
    this.send({
      type: 'key',
      input: { action: 'down', code: event.code, repeat: event.repeat ? 1 : 0, modifiers: modifiersOf(event) },
    });
  }

  private handleUp(event: KeyboardEvent): void {
    if (!this.pressedCodes.delete(event.code)) {
      return;
    }
    event.preventDefault();
    this.send({ type: 'key', input: { action: 'up', code: event.code, repeat: 0, modifiers: modifiersOf(event) } });
  }

  private handleShortcut(event: KeyboardEvent): void {
    if (event.code === 'KeyV') {
      event.preventDefault();
      this.scheduler.flushNow(TEXT_TASK);
      this.send({ type: 'paste' });
      return;
    }
    if (!FORWARDED_SHORTCUTS.has(event.code)) {
      return;
    }
    event.preventDefault();
    const modifiers = modifiersOf(event);
    this.send({ type: 'key', input: { action: 'down', code: event.code, repeat: 0, modifiers } });
    this.send({ type: 'key', input: { action: 'up', code: event.code, repeat: 0, modifiers } });
  }

  private queueText(text: string): void {
    this.pendingText += text;
    this.scheduler.schedule(TEXT_TASK, () => {
      const text = this.pendingText;
      this.pendingText = '';
      this.send({ type: 'text', text });
    });
  }

  private releaseAll(): void {
    for (const code of this.pressedCodes) {
      this.send({
        type: 'key',
        input: { action: 'up', code, repeat: 0, modifiers: { shift: false, alt: false, ctrl: false, meta: false } },
      });
    }
    this.pressedCodes.clear();
  }
}
