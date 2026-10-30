// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_FRAME } from '../../src/shared/deviceFrame';
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

const IPHONE = { screenCornerRadius: 0.14, bezel: 0.04, chin: 0 };
const HOME_BUTTON = { screenCornerRadius: 0, bezel: 0.06, chin: 0.3 };

const defineAll = (element: HTMLElement, values: Record<string, number>) => {
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(element, key, { value, configurable: true });
  }
};

const layout = (stage: HTMLElement, canvas: HTMLCanvasElement, available: { width: number; height: number }, video: { width: number; height: number }, offsets = { left: 0, top: 0, height: 0 }) => {
  defineAll(stage, { clientWidth: available.width, clientHeight: available.height });
  canvas.width = video.width;
  canvas.height = video.height;
  defineAll(canvas, { offsetLeft: offsets.left, offsetTop: offsets.top, offsetWidth: 0, offsetHeight: offsets.height });
};

const property = (stage: HTMLElement, name: string) => stage.style.getPropertyValue(name);
const properties = (stage: HTMLElement) => ['--reflect-frame-radius', '--reflect-frame-bezel-width', '--reflect-frame-chin'].map((name) => property(stage, name));

describe('ViewOptions device frame', () => {
  it('sets the three custom properties from the frame and the width the canvas will have', () => {
    const { stage, canvas, options } = setup();
    layout(stage, canvas, { width: 1000, height: 800 }, { width: 400, height: 800 });
    options.setFrame(IPHONE);
    expect(properties(stage)).toEqual(['56px', '16px', '0px']);
  });

  it('reserves the chin before sizing a height-limited canvas and converges', () => {
    const { stage, canvas, options } = setup();
    layout(stage, canvas, { width: 1000, height: 920 }, { width: 400, height: 800 });
    options.setFrame(HOME_BUTTON);
    const first = properties(stage);
    expect(first).toEqual(['0px', '24px', '120px']);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    expect(properties(stage)).toEqual(first);
  });

  it('is limited by the stage width when that is narrower', () => {
    const { stage, canvas, options } = setup();
    layout(stage, canvas, { width: 200, height: 4000 }, { width: 400, height: 800 });
    options.setFrame(IPHONE);
    expect(properties(stage)).toEqual(['28px', '8px', '0px']);
  });

  it('excludes the stage padding from the available space', () => {
    const { stage, canvas, options } = setup();
    stage.style.padding = '10px';
    layout(stage, canvas, { width: 220, height: 4000 }, { width: 400, height: 800 });
    options.setFrame(IPHONE);
    expect(properties(stage)).toEqual(['28px', '8px', '0px']);
  });

  it('uses the real pixel width in actual mode', () => {
    vi.stubGlobal('devicePixelRatio', 2);
    const { stage, canvas, options, zoom } = setup();
    layout(stage, canvas, { width: 100, height: 100 }, { width: 800, height: 1600 });
    zoom.click();
    options.setFrame(IPHONE);
    expect(properties(stage)).toEqual(['56px', '16px', '0px']);
  });

  it('measures nothing before the first frame arrives', () => {
    const { stage, canvas, options } = setup();
    for (const [width, height] of [[0, 150], [300, 0]] as const) {
      canvas.width = width;
      canvas.height = height;
      options.setFrame(IPHONE);
      expect(properties(stage)).toEqual(['0px', '0px', '0px']);
    }
  });

  it('leaves the stylesheet defaults in place for the generic frame so Android looks as before', () => {
    const { stage, canvas, options } = setup();
    layout(stage, canvas, { width: 1000, height: 800 }, { width: 400, height: 800 });
    options.setFrame(IPHONE);
    options.setFrame(GENERIC_FRAME);
    expect(properties(stage)).toEqual(['', '', '']);
    expect(document.querySelector('.home-button')).toBeNull();
  });

  it('clears the frame on reset', () => {
    const { stage, canvas, options } = setup();
    layout(stage, canvas, { width: 1000, height: 800 }, { width: 400, height: 800 });
    options.setFrame(IPHONE);
    options.resetFrame();
    expect(properties(stage)).toEqual(['', '', '']);
  });

  it('draws a home button in the chin only while the frame is shown and removes it on dispose', () => {
    const { stage, canvas, options, frame } = setup();
    layout(stage, canvas, { width: 1000, height: 920 }, { width: 400, height: 800 }, { left: 20, top: 30, height: 800 });
    options.setFrame(HOME_BUTTON);
    const button = () => document.querySelector<HTMLElement>('.home-button');
    expect(button()).toBeNull();
    frame.click();
    expect(property(stage, '--reflect-frame-chin')).toBe('120px');
    expect([button()?.style.left, button()?.style.top]).toEqual(['20px', '890px']);
    frame.click();
    expect(button()).toBeNull();
    frame.click();
    expect(button()).not.toBeNull();
    options.dispose();
    expect(button()).toBeNull();
  });

  it('applies the frame before the toggle is switched on', () => {
    const { stage, canvas, options } = setup({ frame: true });
    layout(stage, canvas, { width: 1000, height: 920 }, { width: 400, height: 800 });
    options.setFrame(HOME_BUTTON);
    expect(stage.querySelector('.home-button')).not.toBeNull();
  });
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
