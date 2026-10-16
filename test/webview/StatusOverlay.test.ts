// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusOverlay } from '../../src/webview/StatusOverlay';

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML =
    '<div class="status"><span class="status__title"></span><span class="status__detail"></span><button class="status__action" hidden></button></div>';
  root = document.querySelector<HTMLElement>('.status')!;
});

const text = (selector: string) => root.querySelector(selector)?.textContent;

describe('StatusOverlay', () => {
  it('shows connection states with the device name', () => {
    new StatusOverlay(root, () => undefined).show('connecting', 'Pixel 8');
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe('connecting');
    expect(text('.status__title')).toBe('Connecting…');
    expect(text('.status__detail')).toBe('Pixel 8');
  });

  it('prefers the detail over the device name', () => {
    new StatusOverlay(root, () => undefined).show('error', 'Pixel 8', 'server crashed');
    expect(text('.status__title')).toBe('Unable to mirror');
    expect(text('.status__detail')).toBe('server crashed');
  });

  it('hides while streaming', () => {
    new StatusOverlay(root, () => undefined).show('streaming', 'Pixel 8');
    expect(root.hidden).toBe(true);
  });

  it('shows arbitrary messages as errors', () => {
    new StatusOverlay(root, () => undefined).showMessage('WebCodecs unavailable', 'no decoder');
    expect(root.hidden).toBe(false);
    expect(root.dataset.state).toBe('error');
    expect(text('.status__title')).toBe('WebCodecs unavailable');
  });

  it('shows the idle screen with its action and hides the action afterwards', () => {
    const onAction = vi.fn();
    const overlay = new StatusOverlay(root, onAction);
    const action = root.querySelector<HTMLButtonElement>('.status__action')!;
    overlay.showIdle();
    expect(root.dataset.state).toBe('idle');
    expect(text('.status__title')).toBe('No device mirrored');
    expect(action.hidden).toBe(false);
    action.click();
    expect(onAction).toHaveBeenCalledOnce();
    overlay.show('connecting', 'Pixel 8');
    expect(action.hidden).toBe(true);
  });

  it('requires its child elements', () => {
    expect(() => new StatusOverlay(document.createElement('div'), () => undefined)).toThrow('Missing element .status__title');
  });
});
