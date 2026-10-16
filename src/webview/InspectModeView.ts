import type { InspectModeState } from './input/types';

export class InspectModeView implements InspectModeState {
  private enabled = false;

  constructor(
    private readonly banner: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  get active(): boolean {
    return this.enabled;
  }

  set(active: boolean): void {
    this.enabled = active;
    this.banner.hidden = !active;
    this.canvas.classList.toggle('screen--inspecting', active);
    if (active) {
      this.canvas.focus();
    }
  }
}
