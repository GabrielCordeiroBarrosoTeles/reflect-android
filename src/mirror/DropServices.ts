import type { IDropServices, IFilePicker, IUriParser, IDropStaging, StagedFiles } from './types';
import type { DroppedContent } from '../shared/protocol';

export class DropServices implements IDropServices {
  constructor(
    private readonly picker: IFilePicker,
    private readonly uris: IUriParser,
    private readonly staging: IDropStaging,
  ) {}

  async pickFiles(): Promise<readonly string[]> {
    const chosen = await this.picker.showOpenDialog({ canSelectMany: true, canSelectFiles: true, canSelectFolders: true, openLabel: 'Add to Simulator' });
    return (chosen ?? []).map(({ fsPath }) => fsPath);
  }

  uriToPath(uri: string): string {
    return this.uris.parse(uri).fsPath;
  }

  stage(contents: readonly DroppedContent[]): Promise<StagedFiles> {
    return this.staging.stage(contents);
  }
}
