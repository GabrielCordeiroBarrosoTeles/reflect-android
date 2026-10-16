// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewOptions } from '../../src/webview/ViewOptions';

const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

const setup = (saved?: unknown) => {
  document.body.innerHTML = '<nav class="toolbar"><span class="toolbar__timer"></span></nav><main class="stage"><canvas></canvas></main>';
  const toolbar = document.querySelector<HTMLElement>('.toolbar') as HTMLElement;
  const stage = document.querySelector<HTMLElement>('.stage') as HTMLElement;
  const canvas = document.querySelector('canvas') as HTMLCanvasElement;
  const store = { getState: vi.fn(() => saved), setState: vi.fn() };
  const options = new ViewOptions(toolbar, stage, canvas, store);
  const button = (label: string) => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`) as HTMLButtonElement;
  return { toolbar, stage, canvas, store, options, frame: button('Show Device Frame'), zoom: button('Actual Size (1:1)') };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ViewOptions', () => {
  it('adds its buttons before the recording timer and starts fitted without a frame', () => {
    const { toolbar, stage, options, frame, zoom } = setup();
    expect(toolbar.lastElementChild?.className).toBe('toolbar__timer');
    expect(options.current).toEqual({ frame: false, zoom: 'fit' });
    expect(stage.className).toBe('stage');
    expect([frame.getAttribute('aria-pressed'), zoom.getAttribute('aria-pressed')]).toEqual(['false', 'false']);
  });

  it('toggles the device frame and remembers it', () => {
    const { stage, store, frame } = setup();
    frame.click();
    expect(stage.classList.contains('stage--framed')).toBe(true);
    expect(frame.classList.contains('toolbar__button--toggled')).toBe(true);
    expect(store.setState).toHaveBeenLastCalledWith({ frame: true, zoom: 'fit' });
    frame.click();
    expect(stage.classList.contains('stage--framed')).toBe(false);
  });

  it('shows the video at its real pixel size in actual mode and follows resolution changes', async () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { stage, canvas, zoom } = setup();
    canvas.width = 784;
    canvas.height = 1920;
    zoom.click();
    expect(stage.classList.contains('stage--actual')).toBe(true);
    expect([canvas.style.width, canvas.style.height]).toEqual(['392px', '960px']);
    canvas.width = 1920;
    canvas.height = 784;
    await flushMutations();
    expect([canvas.style.width, canvas.style.height]).toEqual(['960px', '392px']);
    zoom.click();
    expect([canvas.style.width, canvas.style.height]).toEqual(['', '']);
  });

  it('restores saved state, waits for the first frame and handles a missing pixel ratio', () => {
    vi.stubGlobal('devicePixelRatio', 0);
    const { stage, canvas } = setup({ frame: true, zoom: 'actual' });
    expect(stage.className).toBe('stage stage--framed stage--actual');
    canvas.width = 0;
    window.dispatchEvent(new Event('resize'));
    expect(canvas.style.width).toBe('');
    canvas.width = 300;
    window.dispatchEvent(new Event('resize'));
    expect(canvas.style.width).toBe('300px');
  });

  it.each([null, 'x', { frame: 'yes', zoom: 'huge' }])('ignores invalid saved state %j', (saved) => {
    expect(setup(saved).options.current).toEqual({ frame: false, zoom: 'fit' });
  });

  it('stops following size changes once disposed', () => {
    const { canvas, zoom, options } = setup();
    zoom.click();
    options.dispose();
    canvas.width = 500;
    window.dispatchEvent(new Event('resize'));
    expect(canvas.style.width).not.toBe('500px');
  });
});
