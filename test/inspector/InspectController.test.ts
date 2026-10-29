import { describe, expect, it, vi } from 'vitest';
import { InspectController } from '../../src/inspector/InspectController';
import type { InspectedComponent } from '../../src/inspector/types';
import { device } from '../fakes/devices';
import { flushPromises } from '../fakes/PushStream';

const component: InspectedComponent = { name: 'Button', props: [], owners: ['Demo'], source: { file: '/app/Demo.tsx', line: 3, column: 1 } };

const highlight = { name: 'Text', owner: 'Demo', location: undefined, x: 0, y: 0.2, width: 0.3, height: 0.1, margin: { top: 0, right: 0, bottom: 0, left: 0 }, padding: { top: 0, right: 0, bottom: 0, left: 0 } };

const setup = (result: Promise<InspectedComponent | undefined> = Promise.resolve(component)) => {
  const services = {
    inspector: {
      inspectAt: vi.fn(() => result),
      highlightAt: vi.fn((_device: unknown, point: { x: number }) => Promise.resolve(point.x < 0 ? undefined : { ...highlight, x: point.x })),
      disconnect: vi.fn(),
      dispose: vi.fn(),
    },
    mirrors: { setInspectMode: vi.fn() },
    view: { show: vi.fn(), reveal: vi.fn() },
    openSource: vi.fn(() => Promise.resolve()),
    onError: vi.fn(),
    notify: vi.fn(),
    setActiveContext: vi.fn(),
    shouldOpenSource: vi.fn(() => true),
  };
  return { services, controller: new InspectController(services) };
};

describe('InspectController', () => {
  it('highlights only the latest hovered point', async () => {
    const { controller, services } = setup();
    const onHighlight = vi.fn();
    controller.start();
    controller.hoverAt(device(), { x: 0.1, y: 0 }, onHighlight);
    controller.hoverAt(device(), { x: 0.2, y: 0 }, onHighlight);
    controller.hoverAt(device(), { x: 0.3, y: 0 }, onHighlight);
    await flushPromises();
    expect(services.inspector.highlightAt.mock.calls.map(([, point]) => point)).toEqual([
      { x: 0.1, y: 0 },
      { x: 0.3, y: 0 },
    ]);
    expect(onHighlight.mock.calls).toEqual([[{ ...highlight, x: 0.1 }], [{ ...highlight, x: 0.3 }]]);
    controller.hoverAt(device(), { x: -1, y: 0 }, onHighlight);
    await flushPromises();
    expect(onHighlight).toHaveBeenLastCalledWith(undefined);
  });

  it('ignores hovers while inactive and drops results after leaving inspect mode', async () => {
    const { controller, services } = setup();
    const onHighlight = vi.fn();
    controller.hoverAt(device(), { x: 0.1, y: 0 }, onHighlight);
    expect(services.inspector.highlightAt).not.toHaveBeenCalled();
    controller.start();
    controller.hoverAt(device(), { x: 0.1, y: 0 }, onHighlight);
    controller.cancel();
    await flushPromises();
    expect(onHighlight).not.toHaveBeenCalled();
  });

  it('treats highlight failures as nothing under the cursor', async () => {
    const { controller, services } = setup();
    services.inspector.highlightAt.mockReturnValueOnce(Promise.reject(new Error('metro down')));
    const onHighlight = vi.fn();
    controller.start();
    controller.hoverAt(device(), { x: 0.1, y: 0 }, onHighlight);
    await flushPromises();
    expect(onHighlight).toHaveBeenCalledWith(undefined);
    expect(services.onError).not.toHaveBeenCalled();
  });

  it('skips hovers while a click is being inspected', async () => {
    let finish!: (value: InspectedComponent) => void;
    const { controller, services } = setup(new Promise((resolve) => (finish = resolve)));
    const onHighlight = vi.fn();
    controller.start();
    controller.hoverAt(device(), { x: 0.1, y: 0 }, onHighlight);
    controller.inspectAt(device(), { x: 0.1, y: 0 });
    controller.hoverAt(device(), { x: 0.2, y: 0 }, onHighlight);
    await flushPromises();
    expect(services.inspector.highlightAt).toHaveBeenCalledOnce();
    expect(onHighlight).not.toHaveBeenCalled();
    finish(component);
    await flushPromises();
  });

  it('enters and leaves inspect mode', () => {
    const { controller, services } = setup();
    controller.start();
    expect(controller.isActive).toBe(true);
    controller.cancel();
    expect(controller.isActive).toBe(false);
    expect(services.mirrors.setInspectMode.mock.calls).toEqual([[true], [false]]);
    expect(services.setActiveContext.mock.calls).toEqual([[true], [false]]);
    expect(services.inspector.disconnect).toHaveBeenCalledOnce();
  });

  it('shows the inspected component, opens its source and leaves inspect mode', async () => {
    const { controller, services } = setup();
    controller.start();
    controller.inspectAt(device(), { x: 0.1, y: 0.2 });
    await flushPromises();
    expect(services.inspector.inspectAt).toHaveBeenCalledWith(device(), { x: 0.1, y: 0.2 });
    expect(services.view.show).toHaveBeenCalledWith(component);
    expect(services.view.reveal).toHaveBeenCalledOnce();
    expect(services.openSource).toHaveBeenCalledWith(component.source);
    expect(controller.isActive).toBe(false);
  });

  it('does not open the source when disabled or unavailable', async () => {
    const disabled = setup();
    disabled.services.shouldOpenSource.mockReturnValue(false);
    disabled.controller.start();
    disabled.controller.inspectAt(device(), { x: 0, y: 0 });
    const withoutSource = setup(Promise.resolve({ ...component, source: undefined }));
    withoutSource.controller.start();
    withoutSource.controller.inspectAt(device(), { x: 0, y: 0 });
    await flushPromises();
    expect(disabled.services.openSource).not.toHaveBeenCalled();
    expect(withoutSource.services.openSource).not.toHaveBeenCalled();
  });

  it('stays in inspect mode when nothing is under the cursor', async () => {
    const { controller, services } = setup(Promise.resolve(undefined));
    controller.start();
    controller.inspectAt(device(), { x: 0, y: 0 });
    await flushPromises();
    expect(services.notify).toHaveBeenCalledWith('No React component at that point');
    expect(controller.isActive).toBe(true);
  });

  it('reports failures and leaves inspect mode', async () => {
    const failure = new Error('metro down');
    const { controller, services } = setup(Promise.reject(failure));
    controller.start();
    controller.inspectAt(device(), { x: 0, y: 0 });
    await flushPromises();
    expect(services.onError).toHaveBeenCalledWith(failure);
    expect(controller.isActive).toBe(false);
  });

  it('ignores clicks while inactive or busy', async () => {
    let finish!: (value: InspectedComponent) => void;
    const { controller, services } = setup(new Promise((resolve) => (finish = resolve)));
    controller.inspectAt(device(), { x: 0, y: 0 });
    controller.start();
    controller.inspectAt(device(), { x: 0, y: 0 });
    controller.inspectAt(device(), { x: 1, y: 1 });
    finish(component);
    await flushPromises();
    expect(services.inspector.inspectAt).toHaveBeenCalledOnce();
  });

  it('disposes the inspector', () => {
    const { controller, services } = setup();
    controller.dispose();
    expect(services.inspector.dispose).toHaveBeenCalledOnce();
  });
});
