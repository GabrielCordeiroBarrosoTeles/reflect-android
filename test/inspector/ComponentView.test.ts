import { describe, expect, it } from 'vitest';
import { COMPONENT_VIEW_ID, ComponentView } from '../../src/inspector/ComponentView';
import { commands, window } from '../mocks/vscode';

describe('ComponentView', () => {
  it('creates the tree view, shows components and reveals itself', () => {
    const view = new ComponentView();
    const tree = window.treeViews[0]!;
    view.show({ name: 'Button', props: [], owners: [], source: undefined });
    view.reveal();
    const provider = tree.options.treeDataProvider as { getChildren(): unknown[]; getTreeItem(node: unknown): { label: string } };
    expect(tree.id).toBe(COMPONENT_VIEW_ID);
    expect(provider.getTreeItem(provider.getChildren()[0]).label).toBe('<Button>');
    expect(commands.executeCommand).toHaveBeenCalledWith('reflect.component.focus');
    view.dispose();
    expect(tree.disposed).toBe(true);
  });
});
