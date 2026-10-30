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

const sizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number, left = 0, top = 0) => {
  for (const [key, value] of Object.entries({ offsetWidth: width, offsetHeight: height, offsetLeft: left, offsetTop: top })) {
    Object.defineProperty(canvas, key, { value, configurable: true });
  }
};

const property = (stage: HTMLElement, name: string) => stage.style.getPropertyValue(name);

describe('ViewOptions device frame', () => {
  it('sets the three custom properties from the frame and the canvas width', () => {
    const { stage, canvas, options } = setup();
    sizeCanvas(canvas, 400, 800);
    options.setFrame(IPHONE);
    expect([property(stage, '--reflect-frame-radius'), property(stage, '--reflect-frame-bezel-width'), property(stage, '--reflect-frame-chin')]).toEqual(['56px', '16px', '0px']);
  });

  it('follows the canvas size on resize', () => {
    const { stage, canvas, options } = setup();
    sizeCanvas(canvas, 400, 800);
    options.setFrame(IPHONE);
    sizeCanvas(canvas, 200, 400);
    window.dispatchEvent(new Event('resize'));
    expect(property(stage, '--reflect-frame-radius')).toBe('28px');
  });

  it('leaves the stylesheet defaults in place for the generic frame so Android looks as before', () => {
    const { stage, canvas, options } = setup();
    sizeCanvas(canvas, 400, 800);
    options.setFrame(IPHONE);
    options.setFrame(GENERIC_FRAME);
    expect([property(stage, '--reflect-frame-radius'), property(stage, '--reflect-frame-bezel-width'), property(stage, '--reflect-frame-chin')]).toEqual(['', '', '']);
    expect(document.querySelector('.home-button')).toBeNull();
  });

  it('draws a home button in the chin only while the frame is shown', () => {
    const { stage, canvas, options, frame } = setup();
    sizeCanvas(canvas, 400, 800, 20, 30);
    options.setFrame(HOME_BUTTON);
    const button = () => document.querySelector<HTMLElement>('.home-button');
    expect(button()).toBeNull();
    frame.click();
    expect(property(stage, '--reflect-frame-chin')).toBe('120px');
    expect([button()?.style.left, button()?.style.top]).toEqual(['220px', '890px']);
    frame.click();
    expect(button()).toBeNull();
  });

  it('applies the frame before the toggle is switched on', () => {
    const { stage, canvas, options } = setup({ frame: true });
    sizeCanvas(canvas, 100, 200);
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
