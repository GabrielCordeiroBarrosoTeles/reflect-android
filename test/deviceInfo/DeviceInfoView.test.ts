import { describe, expect, it, vi } from 'vitest';
import { Emitter } from '../../src/core/Emitter';
import type { DeviceInfoPoller, PollerState } from '../../src/deviceInfo/DeviceInfoPoller';
import { DEVICE_INFO_VIEW_ID, DeviceInfoView } from '../../src/deviceInfo/DeviceInfoView';
import { deviceInfo } from '../fakes/devices';
import { FakeActiveDeviceContext } from '../fakes/FakeActiveDeviceContext';
import { window } from '../mocks/vscode';

const setup = () => {
  const states = new Emitter<PollerState>();
  const poller = { onDidChangeState: states.event, setVisible: vi.fn(), setTarget: vi.fn(), refresh: vi.fn() };
  const context = new FakeActiveDeviceContext();
  context.target = deviceInfo({ serial: 'A' });
  const view = new DeviceInfoView(poller as unknown as DeviceInfoPoller, context, () => ({ maskIpAddress: false }));
  return { poller, states, context, view, tree: window.treeViews[0]! };
};

describe('DeviceInfoView', () => {
  it('creates the tree view and starts polling the target while visible', () => {
    const { poller, tree } = setup();
    expect(tree.id).toBe(DEVICE_INFO_VIEW_ID);
    expect(poller.setVisible).toHaveBeenCalledWith(true);
    expect(poller.setTarget).toHaveBeenCalledWith('A');
  });

  it('follows visibility and target changes', () => {
    const { poller, tree, context } = setup();
    tree.setVisible(false);
    context.setTarget(undefined);
    expect(poller.setVisible).toHaveBeenLastCalledWith(false);
    expect(poller.setTarget).toHaveBeenLastCalledWith(undefined);
  });

  it('renders poller states and refreshes on demand', () => {
    const { states, view, tree, poller } = setup();
    const provider = tree.options.treeDataProvider as { getChildren(): unknown[]; getTreeItem(node: unknown): { label: string } };
    states.fire({ kind: 'failed', error: new Error('x') });
    expect(provider.getTreeItem(provider.getChildren()[0]).label).toBe('Could not read device info');
    view.refresh();
    expect(poller.refresh).toHaveBeenCalledOnce();
  });

  it('disposes the tree view and its subscriptions', () => {
    const { view, tree, context, poller } = setup();
    view.dispose();
    context.setTarget(undefined);
    expect(tree.disposed).toBe(true);
    expect(poller.setTarget).toHaveBeenCalledTimes(1);
  });
});
