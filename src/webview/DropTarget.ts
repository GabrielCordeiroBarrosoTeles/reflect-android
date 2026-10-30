import type { DroppedContent } from '../shared/protocol';

const URI_LIST_TYPES = ['text/uri-list', 'application/vnd.code.uri-list'];

const parseUriList = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));

const lastSegment = (uri: string): string => {
  const segment = uri.replace(/\/+$/, '').replace(/^.*\//, '');
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const describeError = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class DropTarget {
  private enabled = false;
  private readonly controller = new AbortController();

  constructor(
    private readonly stage: HTMLElement,
    private readonly onDrop: (uris: readonly string[], files: readonly DroppedContent[]) => void,
    private readonly onError: (message: string) => void,
  ) {
    const options = { signal: this.controller.signal };
    stage.addEventListener('dragenter', (event) => this.handleDragOver(event as DragEvent), options);
    stage.addEventListener('dragover', (event) => this.handleDragOver(event as DragEvent), options);
    stage.addEventListener('dragleave', (event) => this.handleDragLeave(event as DragEvent), options);
    stage.addEventListener('drop', (event) => void this.handleDrop(event as DragEvent), options);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stage.classList.remove('stage--drop');
    }
  }

  dispose(): void {
    this.controller.abort();
  }

  private accepts(event: DragEvent): DataTransfer | undefined {
    const transfer = event.dataTransfer;
    if (!this.enabled || !transfer) {
      return undefined;
    }
    const types = Array.from(transfer.types);
    return types.includes('Files') || URI_LIST_TYPES.some((type) => types.includes(type)) ? transfer : undefined;
  }

  private handleDragOver(event: DragEvent): void {
    const transfer = this.accepts(event);
    if (!transfer) {
      return;
    }
    event.preventDefault();
    transfer.dropEffect = 'copy';
    this.stage.classList.add('stage--drop');
  }

  private handleDragLeave(event: DragEvent): void {
    if (event.relatedTarget instanceof Node && this.stage.contains(event.relatedTarget)) {
      return;
    }
    this.stage.classList.remove('stage--drop');
  }

  private async handleDrop(event: DragEvent): Promise<void> {
    const transfer = this.accepts(event);
    if (!transfer) {
      return;
    }
    event.preventDefault();
    this.stage.classList.remove('stage--drop');
    const uris = [...new Set(URI_LIST_TYPES.flatMap((type) => parseUriList(transfer.getData(type))))];
    const known = new Set(uris.map(lastSegment));
    const files = await this.readFiles(Array.from(transfer.files).filter((file) => !known.has(file.name)));
    if (uris.length > 0 || files.length > 0) {
      this.onDrop(uris, files);
    }
  }

  private async readFiles(files: readonly File[]): Promise<DroppedContent[]> {
    const contents: DroppedContent[] = [];
    for (const file of files) {
      try {
        contents.push({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) });
      } catch (error) {
        this.onError(`Could not read ${file.name}: ${describeError(error)}`);
      }
    }
    return contents;
  }
}
