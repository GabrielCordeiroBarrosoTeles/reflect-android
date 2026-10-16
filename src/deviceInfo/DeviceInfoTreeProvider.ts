import * as vscode from 'vscode';
import { CommandIds } from '../commands/commandIds';
import type { IDisposable } from '../core/types';
import type { PollerState } from './DeviceInfoPoller';
import { formatSnapshot } from './formatSnapshot';
import type { FormatOptions, InfoEntry, InfoGroup } from './types';


type InfoNode = { readonly kind: 'group'; readonly group: InfoGroup } | { readonly kind: 'entry'; readonly entry: InfoEntry } | { readonly kind: 'message'; readonly text: string; readonly icon: string };

export class DeviceInfoTreeProvider implements vscode.TreeDataProvider<InfoNode>, IDisposable {
  private readonly changeEmitter = new vscode.EventEmitter<InfoNode | undefined>();
  private roots: InfoNode[] = [{ kind: 'message', text: 'No device connected', icon: 'debug-disconnect' }];

  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly readOptions: () => FormatOptions) {}

  update(state: PollerState): void {
    this.roots = this.toRoots(state);
    this.changeEmitter.fire(undefined);
  }

  getChildren(node?: InfoNode): InfoNode[] {
    if (!node) {
      return this.roots;
    }
    return node.kind === 'group' ? node.group.entries.map((entry) => ({ kind: 'entry', entry })) : [];
  }

  getTreeItem(node: InfoNode): vscode.TreeItem {
    switch (node.kind) {
      case 'group': {
        const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon(node.group.icon);
        return item;
      }
      case 'entry': {
        const item = new vscode.TreeItem(node.entry.label, vscode.TreeItemCollapsibleState.None);
        item.description = node.entry.value;
        item.tooltip = `${node.entry.label}: ${node.entry.value} — click to copy`;
        item.command = { command: CommandIds.copyValue, title: 'Copy value', arguments: [node.entry.value] };
        return item;
      }
      case 'message': {
        const item = new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }
    }
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private toRoots(state: PollerState): InfoNode[] {
    switch (state.kind) {
      case 'idle':
        return [{ kind: 'message', text: 'No device connected', icon: 'debug-disconnect' }];
      case 'failed':
        return [{ kind: 'message', text: 'Could not read device info', icon: 'warning' }];
      case 'loaded':
        return formatSnapshot(state.snapshot, this.readOptions()).map((group) => ({ kind: 'group', group }));
    }
  }
}
