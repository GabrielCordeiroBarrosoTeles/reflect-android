import * as vscode from 'vscode';
import type { IDisposable } from '../core/types';
import type { IClipboard } from '../mirror/types';
import type { HostToToolsMessage, ToolsTab, ToolsToHostMessage } from '../shared/toolsProtocol';
import type { ComponentTab } from './ComponentTab';
import type { DeviceTab } from './DeviceTab';
import type { StorageTab } from './StorageTab';
import type { IToolsChannel } from './ToolsChannel';
import { renderToolsHtml } from './toolsHtml';

export const TOOLS_VIEW_ID = 'reflect.tools';

export interface ToolsTabs {
  readonly component: Pick<ComponentTab, 'open' | 'sync'>;
  readonly device: Pick<DeviceTab, 'setActive' | 'refresh' | 'sync'>;
  readonly storage: Pick<StorageTab, 'refresh' | 'write' | 'remove' | 'sync'>;
}

export interface ToolsDependencies {
  readonly clipboard: IClipboard;
  readonly notify: (message: string) => void;
  readonly setTabContext: (tab: ToolsTab) => void;
}

type Handlers = {
  [K in ToolsToHostMessage['type']]: (message: Extract<ToolsToHostMessage, { type: K }>) => Promise<void> | void;
};

const TABS: readonly ToolsTab[] = ['component', 'device', 'storage'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isText = (value: unknown): value is string => typeof value === 'string';

const isSource = (value: unknown): boolean => isRecord(value) && isText(value.file) && typeof value.line === 'number' && typeof value.column === 'number';

const VALIDATORS: Readonly<Record<ToolsToHostMessage['type'], (message: Record<string, unknown>) => boolean>> = {
  ready: () => true,
  'tab-changed': ({ tab }) => TABS.includes(tab as ToolsTab),
  copy: ({ text }) => isText(text),
  'open-source': ({ source }) => isSource(source),
  'device-refresh': () => true,
  'storage-refresh': () => true,
  'storage-save': ({ key, value }) => isText(key) && isText(value),
  'storage-create': ({ key, value }) => isText(key) && isText(value),
  'storage-delete': ({ key }) => isText(key),
};

const isToolsMessage = (value: unknown): value is ToolsToHostMessage =>
  isRecord(value) && Object.hasOwn(VALIDATORS, String(value.type)) && VALIDATORS[value.type as ToolsToHostMessage['type']](value);

export class ToolsViewProvider<T extends ToolsTabs = ToolsTabs> implements vscode.WebviewViewProvider, IToolsChannel, IDisposable {
  private view: vscode.WebviewView | undefined;
  readonly tabs: T;
  private activeTab: ToolsTab = 'component';

  private readonly handlers: Handlers = {
    ready: () => this.syncAll(),
    'tab-changed': ({ tab }) => this.setActiveTab(tab),
    copy: async ({ text }) => {
      await this.dependencies.clipboard.writeText(text);
      this.dependencies.notify(`Copied "${text.length > 40 ? `${text.slice(0, 39)}…` : text}"`);
    },
    'open-source': ({ source }) => this.tabs.component.open(source),
    'device-refresh': () => this.tabs.device.refresh(),
    'storage-refresh': () => this.tabs.storage.refresh(),
    'storage-save': ({ key, value }) => this.tabs.storage.write(key, value, false),
    'storage-create': ({ key, value }) => this.tabs.storage.write(key, value, true),
    'storage-delete': ({ key }) => this.tabs.storage.remove(key),
  };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly dependencies: ToolsDependencies,
    createTabs: (channel: IToolsChannel) => T,
  ) {
    this.tabs = createTabs(this);
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const distUri = vscode.Uri.joinPath(this.extensionUri, 'dist');
    view.webview.options = { enableScripts: true, localResourceRoots: [distUri] };
    view.webview.html = renderToolsHtml({
      cspSource: view.webview.cspSource,
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'tools.js')).toString(),
      styleUri: view.webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'tools.css')).toString(),
    });
    view.webview.onDidReceiveMessage((message: unknown) => this.receive(message));
    view.onDidChangeVisibility(() => this.activate());
    view.onDidDispose(() => {
      this.view = undefined;
      this.activate();
    });
  }

  post(message: HostToToolsMessage): void {
    void this.view?.webview.postMessage(message);
  }

  async reveal(tab: ToolsTab): Promise<void> {
    await vscode.commands.executeCommand(`${TOOLS_VIEW_ID}.focus`);
    this.post({ type: 'select-tab', tab });
    this.setActiveTab(tab);
  }

  isActive(tab: ToolsTab): boolean {
    return this.view?.visible === true && this.activeTab === tab;
  }

  dispose(): void {
    this.view = undefined;
  }

  private async receive(message: unknown): Promise<void> {
    if (isToolsMessage(message)) {
      await (this.handlers[message.type] as (value: ToolsToHostMessage) => Promise<void> | void)(message);
    }
  }

  private syncAll(): void {
    this.tabs.component.sync();
    this.tabs.device.sync();
    this.tabs.storage.sync();
  }

  private setActiveTab(tab: ToolsTab): void {
    this.activeTab = tab;
    this.dependencies.setTabContext(tab);
    this.activate();
  }

  private activate(): void {
    this.tabs.device.setActive(this.isActive('device'));
    if (this.isActive('storage')) {
      void this.tabs.storage.refresh();
    }
  }
}
