import type { BoxEdges, InspectHighlight } from '../shared/protocol';
import { containedContentRect } from './input/coordinates';
import type { Disposable, InspectModeState } from './input/types';

interface PixelScale {
  readonly width: number;
  readonly height: number;
}

const toBorderWidth = (edges: BoxEdges, scale: PixelScale): string =>
  `${edges.top * scale.height}px ${edges.right * scale.width}px ${edges.bottom * scale.height}px ${edges.left * scale.width}px`;

export class InspectHighlightView implements Disposable {
  private pointerInside = false;
  private readonly margin: HTMLElement;
  private readonly padding: HTMLElement;
  private readonly abort = new AbortController();

  constructor(
    private readonly box: HTMLElement,
    private readonly label: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly inspectMode: InspectModeState,
  ) {
    this.margin = this.createLayer('inspect-highlight__margin');
    this.padding = this.createLayer('inspect-highlight__padding');
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointermove', () => (this.pointerInside = true), options);
    canvas.addEventListener(
      'pointerleave',
      () => {
        this.pointerInside = false;
        this.hide();
      },
      options,
    );
    window.addEventListener('resize', () => this.hide(), options);
  }

  show(highlight: InspectHighlight | undefined): void {
    if (!highlight || !this.inspectMode.active || !this.pointerInside) {
      this.hide();
      return;
    }
    const container = this.box.parentElement;
    const origin = container?.getBoundingClientRect() ?? { left: 0, top: 0 };
    const scrollLeft = container?.scrollLeft ?? 0;
    const scrollTop = container?.scrollTop ?? 0;
    const content = containedContentRect(this.canvas.getBoundingClientRect(), this.canvas.width, this.canvas.height);
    const scale = { width: content.width, height: content.height };
    this.box.style.left = `${content.left - origin.left + scrollLeft + highlight.x * content.width}px`;
    this.box.style.top = `${content.top - origin.top + scrollTop + highlight.y * content.height}px`;
    this.box.style.width = `${highlight.width * content.width}px`;
    this.box.style.height = `${highlight.height * content.height}px`;
    this.margin.style.top = `${-highlight.margin.top * content.height}px`;
    this.margin.style.right = `${-highlight.margin.right * content.width}px`;
    this.margin.style.bottom = `${-highlight.margin.bottom * content.height}px`;
    this.margin.style.left = `${-highlight.margin.left * content.width}px`;
    this.margin.style.borderWidth = toBorderWidth(highlight.margin, scale);
    this.padding.style.borderWidth = toBorderWidth(highlight.padding, scale);
    this.label.textContent = [`<${highlight.name}>`, highlight.owner && `in ${highlight.owner}`, highlight.location && `· ${highlight.location}`]
      .filter(Boolean)
      .join(' ');
    this.box.classList.toggle('inspect-highlight--label-below', highlight.y - highlight.margin.top < 0.06);
    this.box.hidden = false;
  }

  hide(): void {
    this.box.hidden = true;
  }

  dispose(): void {
    this.abort.abort();
  }

  private createLayer(className: string): HTMLElement {
    const layer = document.createElement('span');
    layer.className = className;
    this.box.prepend(layer);
    return layer;
  }
}
