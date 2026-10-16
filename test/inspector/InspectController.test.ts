import { describe, expect, it, vi } from 'vitest';
import { InspectController } from '../../src/inspector/InspectController';
import type { InspectedComponent } from '../../src/inspector/types';
import { deviceInfo } from '../fakes/devices';
import { flushPromises } from '../fakes/PushStream';

const component: InspectedComponent = { name: 'Button', props: [], owners: ['Demo'], source: { file: '/app/Demo.tsx', line: 3, column: 1 } };

const setup = (result: Promise<InspectedComponent | undefined> = Promise.resolve(component)) => {
  const services = {
    inspector: { inspectAt: vi.fn(() => result), disconnect: vi.fn(), dispose: vi.fn() },
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
    controller.inspectAt(deviceInfo(), { x: 0.1, y: 0.2 });
    await flushPromises();
    expect(services.inspector.inspectAt).toHaveBeenCalledWith(deviceInfo(), { x: 0.1, y: 0.2 });
    expect(services.view.show).toHaveBeenCalledWith(component);
    expect(services.view.reveal).toHaveBeenCalledOnce();
    expect(services.openSource).toHaveBeenCalledWith(component.source);
    expect(controller.isActive).toBe(false);
  });

  it('does not open the source when disabled or unavailable', async () => {
    const disabled = setup();
    disabled.services.shouldOpenSource.mockReturnValue(false);
    disabled.controller.start();
    disabled.controller.inspectAt(deviceInfo(), { x: 0, y: 0 });
    const withoutSource = setup(Promise.resolve({ ...component, source: undefined }));
    withoutSource.controller.start();
    withoutSource.controller.inspectAt(deviceInfo(), { x: 0, y: 0 });
    await flushPromises();
    expect(disabled.services.openSource).not.toHaveBeenCalled();
    expect(withoutSource.services.openSource).not.toHaveBeenCalled();
  });

  it('stays in inspect mode when nothing is under the cursor', async () => {
    const { controller, services } = setup(Promise.resolve(undefined));
    controller.start();
    controller.inspectAt(deviceInfo(), { x: 0, y: 0 });
    await flushPromises();
    expect(services.notify).toHaveBeenCalledWith('No React component at that point');
    expect(controller.isActive).toBe(true);
  });

  it('reports failures and leaves inspect mode', async () => {
    const failure = new Error('metro down');
    const { controller, services } = setup(Promise.reject(failure));
    controller.start();
    controller.inspectAt(deviceInfo(), { x: 0, y: 0 });
    await flushPromises();
    expect(services.onError).toHaveBeenCalledWith(failure);
    expect(controller.isActive).toBe(false);
  });

  it('ignores clicks while inactive or busy', async () => {
    let finish!: (value: InspectedComponent) => void;
    const { controller, services } = setup(new Promise((resolve) => (finish = resolve)));
    controller.inspectAt(deviceInfo(), { x: 0, y: 0 });
    controller.start();
    controller.inspectAt(deviceInfo(), { x: 0, y: 0 });
    controller.inspectAt(deviceInfo(), { x: 1, y: 1 });
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
