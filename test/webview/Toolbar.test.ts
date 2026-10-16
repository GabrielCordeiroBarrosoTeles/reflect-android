// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTION_IDS } from '../../src/shared/actions';
import { Toolbar } from '../../src/webview/Toolbar';

afterEach(() => {
  vi.useRealTimers();
});

const setup = (now = () => 0) => {
  document.body.innerHTML = '<nav class="toolbar"></nav>';
  const root = document.querySelector<HTMLElement>('.toolbar')!;
  const onAction = vi.fn();
  return { root, onAction, toolbar: new Toolbar(root, onAction, now) };
};

describe('Toolbar', () => {
  it('renders one labelled codicon button per action, grouped', () => {
    const { root } = setup();
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.toolbar__button')];
    expect(root.querySelectorAll('.toolbar__group')).toHaveLength(4);
    expect(buttons).toHaveLength(ACTION_IDS.length);
    expect(buttons[0]?.className).toBe('toolbar__button codicon codicon-arrow-left');
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Back');
    expect(buttons[0]?.type).toBe('button');
  });

  it('reports clicked actions', () => {
    const { root, onAction } = setup();
    root.querySelector<HTMLButtonElement>('[aria-label="Take Screenshot"]')?.click();
    expect(onAction).toHaveBeenCalledWith('screenshot');
  });

  it('shows a running recording timer and the screen-off state', () => {
    vi.useFakeTimers();
    let now = 0;
    const { root, toolbar } = setup(() => now);
    const record = root.querySelector<HTMLButtonElement>('[aria-label="Start/Stop Recording"]')!;
    const screen = root.querySelector<HTMLButtonElement>('[aria-label="Turn Device Screen On/Off"]')!;
    const timer = root.querySelector<HTMLElement>('.toolbar__timer')!;
    expect(timer.hidden).toBe(true);
    toolbar.update({ recordingSince: 0, screenOff: true });
    expect(timer.textContent).toBe('● 0:00');
    now = 65_000;
    vi.advanceTimersByTime(1000);
    expect(timer.textContent).toBe('● 1:05');
    expect(record.getAttribute('aria-pressed')).toBe('true');
    expect(screen.classList.contains('toolbar__button--active')).toBe(true);
    toolbar.update({ recordingSince: undefined, screenOff: false });
    expect(timer.hidden).toBe(true);
    expect(record.getAttribute('aria-pressed')).toBe('false');
    toolbar.dispose();
  });

  it('never shows negative time', () => {
    const { root, toolbar } = setup(() => 0);
    toolbar.update({ recordingSince: 5000, screenOff: false });
    expect(root.querySelector('.toolbar__timer')?.textContent).toBe('● 0:00');
  });

  it('uses the real clock by default', () => {
    document.body.innerHTML = '<nav class="toolbar"></nav>';
    const toolbar = new Toolbar(document.querySelector<HTMLElement>('.toolbar')!, vi.fn());
    toolbar.update({ recordingSince: Date.now(), screenOff: false });
    expect(document.querySelector('.toolbar__timer')?.textContent).toBe('● 0:00');
    toolbar.dispose();
  });
});
