import * as vscode from 'vscode';
import type { IDisposable } from '../core/types';
import { ComponentTreeProvider } from './ComponentTreeProvider';
import type { InspectedComponent } from './types';

export const COMPONENT_VIEW_ID = 'reflect.component';

export class ComponentView implements IDisposable {
  private readonly provider = new ComponentTreeProvider();
  private readonly view = vscode.window.createTreeView(COMPONENT_VIEW_ID, { treeDataProvider: this.provider });

  show(component: InspectedComponent): void {
    this.provider.show(component);
  }

  reveal(): void {
    void vscode.commands.executeCommand(`${COMPONENT_VIEW_ID}.focus`);
  }

  dispose(): void {
    this.view.dispose();
    this.provider.dispose();
  }
}
