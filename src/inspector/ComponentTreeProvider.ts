import * as vscode from 'vscode';
import { CommandIds } from '../commands/commandIds';
import type { IDisposable } from '../core/types';
import type { InspectedComponent, SourceLocation } from './types';

type ComponentNode =
  | { readonly kind: 'hint' }
  | { readonly kind: 'name'; readonly component: InspectedComponent }
  | { readonly kind: 'section'; readonly label: string; readonly icon: string; readonly children: readonly ComponentNode[] }
  | { readonly kind: 'value'; readonly label: string; readonly value: string };

const VISIBLE_SEGMENTS = 3;

const displayPath = (file: string): string => {
  const relative = vscode.workspace.asRelativePath(file);
  if (relative !== file) {
    return relative;
  }
  const segments = file.split(/[\\/]/).filter(Boolean);
  return segments.length > VISIBLE_SEGMENTS ? `…/${segments.slice(-VISIBLE_SEGMENTS).join('/')}` : file;
};

const workspaceRelative = (source: SourceLocation): string => `${displayPath(source.file)}:${source.line}`;

export class ComponentTreeProvider implements vscode.TreeDataProvider<ComponentNode>, IDisposable {
  private readonly changeEmitter = new vscode.EventEmitter<ComponentNode | undefined>();
  private roots: ComponentNode[] = [{ kind: 'hint' }];

  readonly onDidChangeTreeData = this.changeEmitter.event;

  show(component: InspectedComponent): void {
    this.roots = [
      { kind: 'name', component },
      {
        kind: 'section',
        label: `Props (${component.props.length})`,
        icon: 'symbol-property',
        children: component.props.map((prop) => ({ kind: 'value', label: prop.name, value: prop.value })),
      },
      {
        kind: 'section',
        label: 'Rendered by',
        icon: 'type-hierarchy',
        children: component.owners.map((owner, index) => ({ kind: 'value', label: owner, value: index === 0 ? 'selected' : '' })),
      },
    ];
    this.changeEmitter.fire(undefined);
  }

  getChildren(node?: ComponentNode): ComponentNode[] {
    if (!node) {
      return this.roots;
    }
    return node.kind === 'section' ? [...node.children] : [];
  }

  getTreeItem(node: ComponentNode): vscode.TreeItem {
    switch (node.kind) {
      case 'hint': {
        const item = new vscode.TreeItem('Click Inspect, then a component on the device', vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('inspect');
        return item;
      }
      case 'name': {
        const item = new vscode.TreeItem(`<${node.component.name}>`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('symbol-class');
        const source = node.component.source;
        item.description = source ? workspaceRelative(source) : 'source unavailable';
        if (source) {
          item.tooltip = `Open ${workspaceRelative(source)}`;
          item.command = { command: CommandIds.openComponentSource, title: 'Open source', arguments: [source] };
        }
        return item;
      }
      case 'section': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }
      case 'value': {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.description = node.value;
        item.tooltip = node.value ? `${node.label}: ${node.value}` : node.label;
        return item;
      }
    }
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
