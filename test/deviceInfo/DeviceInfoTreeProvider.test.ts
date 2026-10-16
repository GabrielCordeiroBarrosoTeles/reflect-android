import { describe, expect, it, vi } from 'vitest';
import { DeviceInfoTreeProvider } from '../../src/deviceInfo/DeviceInfoTreeProvider';
import type { DeviceSnapshot } from '../../src/deviceInfo/types';
import { TreeItemCollapsibleState } from '../mocks/vscode';

const snapshot: DeviceSnapshot = {
  props: { manufacturer: 'samsung', model: 'SM-F741B', androidVersion: '16', sdk: '36', abi: 'arm64-v8a' },
  battery: undefined,
  memory: undefined,
  storage: undefined,
  display: { resolution: undefined, density: undefined },
  network: { ipAddress: undefined, airplaneMode: false },
  foregroundPackage: undefined,
};

describe('DeviceInfoTreeProvider', () => {
  it('starts with a "no device" message', () => {
    const provider = new DeviceInfoTreeProvider(() => ({ maskIpAddress: false }));
    const [root] = provider.getChildren();
    const item = provider.getTreeItem(root!);
    expect(item.label).toBe('No device connected');
    expect(provider.getChildren(root)).toEqual([]);
  });

  it('shows expanded groups whose entries copy their value on click', () => {
    const provider = new DeviceInfoTreeProvider(() => ({ maskIpAddress: false }));
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    provider.update({ kind: 'loaded', snapshot });
    expect(changed).toHaveBeenCalledOnce();
    const [device] = provider.getChildren();
    const groupItem = provider.getTreeItem(device!);
    expect(groupItem).toMatchObject({ label: 'Device', collapsibleState: TreeItemCollapsibleState.Expanded, iconPath: { id: 'device-mobile' } });
    const [model] = provider.getChildren(device);
    const entryItem = provider.getTreeItem(model!);
    expect(entryItem).toMatchObject({
      label: 'Model',
      description: 'samsung SM-F741B',
      command: { command: 'reflect.copyValue', arguments: ['samsung SM-F741B'] },
    });
    expect(provider.getChildren(model)).toEqual([]);
  });

  it.each([
    [{ kind: 'idle' } as const, 'No device connected', 'debug-disconnect'],
    [{ kind: 'failed', error: new Error('x') } as const, 'Could not read device info', 'warning'],
  ])('shows a message for %j', (state, text, icon) => {
    const provider = new DeviceInfoTreeProvider(() => ({ maskIpAddress: false }));
    provider.update(state);
    expect(provider.getTreeItem(provider.getChildren()[0]!)).toMatchObject({ label: text, iconPath: { id: icon } });
  });

  it('stops notifying after dispose', () => {
    const provider = new DeviceInfoTreeProvider(() => ({ maskIpAddress: false }));
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    provider.dispose();
    provider.update({ kind: 'idle' });
    expect(changed).not.toHaveBeenCalled();
  });
});
