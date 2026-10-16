import { describe, expect, it, vi } from 'vitest';
import { ComponentTreeProvider } from '../../src/inspector/ComponentTreeProvider';
import type { InspectedComponent } from '../../src/inspector/types';
import { TreeItemCollapsibleState } from '../mocks/vscode';

const component: InspectedComponent = {
  name: 'PrimaryButton',
  props: [{ name: 'children', value: '"Copy"' }],
  owners: ['Styled(Text)', 'Demo'],
  source: { file: '/workspace/src/Demo.tsx', line: 58, column: 11 },
};

describe('ComponentTreeProvider', () => {
  it('starts with a hint', () => {
    const provider = new ComponentTreeProvider();
    const [hint] = provider.getChildren();
    expect(provider.getTreeItem(hint!)).toMatchObject({ label: 'Click Inspect, then a component on the device', iconPath: { id: 'inspect' } });
    expect(provider.getChildren(hint)).toEqual([]);
  });

  it('shows the component with a clickable source, props and owners', () => {
    const provider = new ComponentTreeProvider();
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    provider.show(component);
    const [name, props, owners] = provider.getChildren();
    expect(changed).toHaveBeenCalledOnce();
    expect(provider.getTreeItem(name!)).toMatchObject({
      label: '<PrimaryButton>',
      description: 'src/Demo.tsx:58',
      tooltip: 'Open src/Demo.tsx:58',
      command: { command: 'reflect.openComponentSource', arguments: [component.source] },
    });
    expect(provider.getTreeItem(props!)).toMatchObject({ label: 'Props (1)', collapsibleState: TreeItemCollapsibleState.Expanded });
    expect(provider.getChildren(props).map((node) => provider.getTreeItem(node))).toMatchObject([
      { label: 'children', description: '"Copy"', tooltip: 'children: "Copy"' },
    ]);
    expect(provider.getChildren(owners).map((node) => provider.getTreeItem(node))).toMatchObject([
      { label: 'Styled(Text)', description: 'selected' },
      { label: 'Demo', description: '', tooltip: 'Demo' },
    ]);
    expect(provider.getChildren(name)).toEqual([]);
  });

  it('shortens paths outside the workspace', () => {
    const provider = new ComponentTreeProvider();
    provider.show({ ...component, source: { file: '/Users/me/projects/app/src/Demo.tsx', line: 3, column: 1 } });
    expect(provider.getTreeItem(provider.getChildren()[0]!).description).toBe('…/app/src/Demo.tsx:3');
    provider.show({ ...component, source: { file: '/a/b.tsx', line: 1, column: 1 } });
    expect(provider.getTreeItem(provider.getChildren()[0]!).description).toBe('/a/b.tsx:1');
  });

  it('marks components without source', () => {
    const provider = new ComponentTreeProvider();
    provider.show({ ...component, source: undefined });
    const item = provider.getTreeItem(provider.getChildren()[0]!);
    expect(item.description).toBe('source unavailable');
    expect(item.command).toBeUndefined();
  });

  it('stops notifying after dispose', () => {
    const provider = new ComponentTreeProvider();
    const changed = vi.fn();
    provider.onDidChangeTreeData(changed);
    provider.dispose();
    provider.show(component);
    expect(changed).not.toHaveBeenCalled();
  });
});
