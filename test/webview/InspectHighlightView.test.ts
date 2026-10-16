// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { InspectHighlight } from '../../src/shared/protocol';
import { InspectHighlightView } from '../../src/webview/InspectHighlightView';

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

const highlight: InspectHighlight = { name: 'Text', owner: 'ProfileCard', location: 'ProfileCard.tsx:12', x: 0.25, y: 0.5, width: 0.5, height: 0.1, margin: { top: 0.01, right: 0, bottom: 0.02, left: 0.1 }, padding: { top: 0.05, right: 0.1, bottom: 0, left: 0 } };

const setup = (withContainer = true) => {
  const stage = document.createElement('main');
  stage.getBoundingClientRect = () => rect(10, 20, 300, 600);
  const canvas = document.createElement('canvas');
  canvas.width = 100;
  canvas.height = 200;
  canvas.getBoundingClientRect = () => rect(60, 40, 200, 400);
  const box = document.createElement('div');
  box.hidden = true;
  const label = document.createElement('span');
  box.append(label);
  stage.append(canvas);
  if (withContainer) {
    stage.append(box);
  }
  document.body.append(stage);
  const inspectMode = { active: true };
  const view = new InspectHighlightView(box, label, canvas, inspectMode);
  canvas.dispatchEvent(new PointerEvent('pointermove'));
  return { box, label, canvas, inspectMode, view };
};

describe('InspectHighlightView', () => {
  it('draws the box over the video relative to its container and labels the component', () => {
    const { box, view } = setup();
    view.show(highlight);
    expect(box.hidden).toBe(false);
    expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual(['100px', '220px', '100px', '40px']);
    expect(box.textContent).toBe('<Text> in ProfileCard · ProfileCard.tsx:12');
    expect(box.classList.contains('inspect-highlight--label-below')).toBe(false);
    const margin = box.querySelector<HTMLElement>('.inspect-highlight__margin');
    const padding = box.querySelector<HTMLElement>('.inspect-highlight__padding');
    expect([margin?.style.top, margin?.style.right, margin?.style.bottom, margin?.style.left]).toEqual(['-4px', '0px', '-8px', '-20px']);
    expect(margin?.style.borderWidth).toBe('4px 0px 8px 20px');
    expect(padding?.style.borderWidth).toBe('20px 20px 0px 0px');
  });

  it('accounts for the container scroll position', () => {
    const { box, view } = setup();
    const stage = box.parentElement as HTMLElement;
    stage.scrollLeft = 30;
    stage.scrollTop = 50;
    view.show(highlight);
    expect([box.style.left, box.style.top]).toEqual([`${100 + stage.scrollLeft}px`, `${220 + stage.scrollTop}px`]);
  });

  it('uses page coordinates without a container and moves the label below near the top', () => {
    const { box, view } = setup(false);
    view.show({ ...highlight, owner: undefined, location: undefined, y: 0, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    expect([box.style.left, box.style.top]).toEqual(['110px', '40px']);
    expect(box.textContent).toBe('<Text>');
    expect(box.classList.contains('inspect-highlight--label-below')).toBe(true);
  });

  it('hides when there is nothing to show, inspect mode is off or the pointer left', () => {
    const { box, view, canvas, inspectMode } = setup();
    view.show(highlight);
    view.show(undefined);
    expect(box.hidden).toBe(true);
    inspectMode.active = false;
    view.show(highlight);
    expect(box.hidden).toBe(true);
    inspectMode.active = true;
    view.show(highlight);
    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    expect(box.hidden).toBe(true);
    view.show(highlight);
    expect(box.hidden).toBe(true);
  });

  it('hides on resize and stops listening once disposed', () => {
    const { box, view, canvas } = setup();
    view.show(highlight);
    window.dispatchEvent(new Event('resize'));
    expect(box.hidden).toBe(true);
    view.show(highlight);
    view.dispose();
    canvas.dispatchEvent(new PointerEvent('pointerleave'));
    expect(box.hidden).toBe(false);
  });
});
