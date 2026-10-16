import { vi } from 'vitest';

type Listener<T> = (value: T) => void;

export interface MessageItem {
  readonly title: string;
}

export class EventEmitter<T> {
  private readonly listeners = new Set<Listener<T>>();

  readonly event = (listener: Listener<T>): { dispose(): void } => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  fire(value: T): void {
    for (const listener of [...this.listeners]) {
      listener(value);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class Uri {
  private constructor(readonly fsPath: string) {}

  static file(path: string): Uri {
    return new Uri(path);
  }

  static parse(value: string): Uri {
    return new Uri(value);
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri([base.fsPath, ...segments].join('/'));
  }

  toString(): string {
    return this.fsPath;
  }
}

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;

export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  constructor(
    readonly start: Position,
    readonly end: Position,
  ) {}
}

export class ThemeIcon {
  constructor(readonly id: string) {}
}

export class TreeItem {
  description: string | undefined;
  tooltip: string | undefined;
  iconPath: ThemeIcon | undefined;
  command: { command: string; title: string; arguments?: unknown[] } | undefined;

  constructor(
    readonly label: string,
    readonly collapsibleState: number,
  ) {}
}

export class FakeTreeView {
  visible = true;
  disposed = false;
  private readonly visibilityEmitter = new EventEmitter<{ visible: boolean }>();
  readonly onDidChangeVisibility = this.visibilityEmitter.event;

  constructor(
    readonly id: string,
    readonly options: { treeDataProvider: unknown },
  ) {}

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibilityEmitter.fire({ visible });
  }

  dispose(): void {
    this.disposed = true;
  }
}

export const ViewColumn = { Active: -1, Beside: -2, One: 1 } as const;

export class FakeStatusBarItem {
  text = '';
  tooltip: string | undefined;
  name: string | undefined;
  command: string | undefined;
  visible = false;
  disposed = false;

  constructor(
    readonly id: string,
    readonly alignment: number,
    readonly priority: number,
  ) {}

  show(): void {
    this.visible = true;
  }

  dispose(): void {
    this.disposed = true;
  }
}

export class FakeWebview {
  html = '';
  options: unknown;
  readonly cspSource = 'vscode-resource:';
  readonly posted: unknown[] = [];
  readonly received = new EventEmitter<unknown>();
  readonly onDidReceiveMessage = this.received.event;

  postMessage(message: unknown): Promise<boolean> {
    this.posted.push(message);
    return Promise.resolve(true);
  }

  asWebviewUri(uri: Uri): Uri {
    return Uri.parse(`webview:${uri.fsPath}`);
  }
}

export class FakeWebviewPanel {
  readonly webview = new FakeWebview();
  visible = true;
  revealed = 0;
  private readonly disposeEmitter = new EventEmitter<void>();
  private readonly viewStateEmitter = new EventEmitter<{ webviewPanel: FakeWebviewPanel }>();
  readonly onDidDispose = this.disposeEmitter.event;
  readonly onDidChangeViewState = this.viewStateEmitter.event;

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.viewStateEmitter.fire({ webviewPanel: this });
  }

  constructor(
    readonly viewType: string,
    readonly title: string,
    readonly column: number,
    readonly options: unknown,
  ) {}

  reveal(): void {
    this.revealed += 1;
  }

  dispose(): void {
    this.disposeEmitter.fire();
  }
}

export class FakeWebviewView {
  readonly webview = new FakeWebview();
  visible = true;
  private readonly visibilityEmitter = new EventEmitter<void>();
  private readonly disposeEmitter = new EventEmitter<void>();
  readonly onDidChangeVisibility = this.visibilityEmitter.event;
  readonly onDidDispose = this.disposeEmitter.event;

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.visibilityEmitter.fire();
  }

  dispose(): void {
    this.disposeEmitter.fire();
  }
}

export class FakeOutputChannel {
  readonly lines: string[] = [];
  shown = 0;
  disposed = false;

  constructor(readonly name: string) {}

  info(message: string): void {
    this.lines.push(`info ${message}`);
  }

  error(message: string, ...args: unknown[]): void {
    this.lines.push(`error ${message}${args.length ? ` ${args.map(String).join(' ')}` : ''}`);
  }

  show(): void {
    this.shown += 1;
  }

  dispose(): void {
    this.disposed = true;
  }
}

const configuration = new Map<string, unknown>();
const viewProviders = new Map<string, { resolveWebviewView(view: unknown): void }>();

export const window = {
  statusBarItems: [] as FakeStatusBarItem[],
  panels: [] as FakeWebviewPanel[],
  outputChannels: [] as FakeOutputChannel[],
  createStatusBarItem: vi.fn((id: string, alignment: number, priority: number) => {
    const item = new FakeStatusBarItem(id, alignment, priority);
    window.statusBarItems.push(item);
    return item;
  }),
  createWebviewPanel: vi.fn((viewType: string, title: string, column: number, options: unknown) => {
    const panel = new FakeWebviewPanel(viewType, title, column, options);
    window.panels.push(panel);
    return panel;
  }),
  createOutputChannel: vi.fn((name: string) => {
    const channel = new FakeOutputChannel(name);
    window.outputChannels.push(channel);
    return channel;
  }),
  showErrorMessage: vi.fn<(message: string, ...items: MessageItem[]) => Promise<MessageItem | undefined>>(() =>
    Promise.resolve(undefined),
  ),
  chooseErrorAction(title: string | undefined): void {
    window.showErrorMessage.mockImplementation((_message, ...items) =>
      Promise.resolve(items.find((item) => item.title === title)),
    );
  },
  viewProviders,
  treeViews: [] as FakeTreeView[],
  createTreeView: vi.fn((id: string, options: { treeDataProvider: unknown }) => {
    const view = new FakeTreeView(id, options);
    window.treeViews.push(view);
    return view;
  }),
  showInformationMessage: vi.fn<(message: string, ...items: string[]) => Promise<string | undefined>>(() => Promise.resolve(undefined)),
  showTextDocument: vi.fn((_uri: Uri, _options?: unknown) => Promise.resolve(undefined)),
  setStatusBarMessage: vi.fn((_text: string, _timeout: number) => ({ dispose: () => undefined })),
  registerWebviewViewProvider: vi.fn((id: string, provider: { resolveWebviewView(view: unknown): void }) => {
    viewProviders.set(id, provider);
    return { dispose: () => viewProviders.delete(id) };
  }),
  showQuickPick: vi.fn<(items: readonly unknown[], options?: unknown) => Promise<unknown>>(() => Promise.resolve(undefined)),
};

const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

export const commands = {
  registered: registeredCommands,
  registerCommand: vi.fn((id: string, callback: (...args: unknown[]) => unknown) => {
    registeredCommands.set(id, callback);
    return { dispose: () => registeredCommands.delete(id) };
  }),
  executeCommand: vi.fn<(id: string, ...args: unknown[]) => Promise<unknown>>(() => Promise.resolve(undefined)),
};

const configurationEmitter = new EventEmitter<{ affectsConfiguration(section: string): boolean }>();

export const workspace = {
  configuration,
  workspaceFolders: undefined as { uri: Uri }[] | undefined,
  changeConfiguration: (section: string): void =>
    configurationEmitter.fire({ affectsConfiguration: (candidate: string) => candidate === section || section.startsWith(`${candidate}.`) }),
  onDidChangeConfiguration: configurationEmitter.event,
  asRelativePath: vi.fn((target: string | Uri) => (typeof target === 'string' ? target : target.fsPath).replace(/^\/workspace\//, '')),
  getConfiguration: vi.fn((section: string) => ({
    get: <T>(key: string): T | undefined => configuration.get(`${section}.${key}`) as T | undefined,
  })),
};

let clipboardText = '';

export const env = {
  clipboard: {
    readText: vi.fn(() => Promise.resolve(clipboardText)),
    writeText: vi.fn((text: string) => {
      clipboardText = text;
      return Promise.resolve();
    }),
  },
  openExternal: vi.fn((_uri: Uri) => Promise.resolve(true)),
};

export const resetVscodeMock = (): void => {
  window.statusBarItems.length = 0;
  window.panels.length = 0;
  window.outputChannels.length = 0;
  window.treeViews.length = 0;
  registeredCommands.clear();
  viewProviders.clear();
  configuration.clear();
  clipboardText = '';
  window.showErrorMessage.mockImplementation(() => Promise.resolve(undefined));
  window.showQuickPick.mockImplementation(() => Promise.resolve(undefined));
  window.showInformationMessage.mockImplementation(() => Promise.resolve(undefined));
  workspace.workspaceFolders = undefined;
  commands.executeCommand.mockImplementation(() => Promise.resolve(undefined));
};
