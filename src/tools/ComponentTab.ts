import * as vscode from 'vscode';
import type { InspectedComponent, SourceLocation } from '../inspector/types';
import type { ComponentPanelView } from '../shared/toolsProtocol';
import type { IToolsChannel } from './ToolsChannel';

const VISIBLE_SEGMENTS = 3;

export const displayPath = (file: string): string => {
  const relative = vscode.workspace.asRelativePath(file);
  if (relative !== file) {
    return relative;
  }
  const segments = file.split(/[\\/]/).filter(Boolean);
  return segments.length > VISIBLE_SEGMENTS ? `…/${segments.slice(-VISIBLE_SEGMENTS).join('/')}` : file;
};

const toView = ({ name, props, owners, source }: InspectedComponent): ComponentPanelView => ({
  name,
  source,
  location: source && `${displayPath(source.file)}:${source.line}`,
  props,
  owners,
});

export class ComponentTab {
  private view: ComponentPanelView | undefined;

  constructor(
    private readonly channel: IToolsChannel,
    private readonly openSource: (source: SourceLocation) => Promise<void>,
  ) {}

  show(component: InspectedComponent): void {
    this.view = toView(component);
    this.sync();
  }

  reveal(): void {
    void this.channel.reveal('component');
  }

  open(source: SourceLocation): Promise<void> {
    return this.openSource(source);
  }

  sync(): void {
    this.channel.post({ type: 'component', view: this.view });
  }
}
