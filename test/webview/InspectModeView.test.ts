// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { InspectModeView } from '../../src/webview/InspectModeView';

describe('InspectModeView', () => {
  it('shows the banner, the crosshair and focuses the screen while active', () => {
    const banner = document.createElement('div');
    banner.hidden = true;
    const canvas = document.createElement('canvas');
    canvas.tabIndex = 0;
    document.body.append(banner, canvas);
    const view = new InspectModeView(banner, canvas);
    view.set(true);
    expect(view.active).toBe(true);
    expect(banner.hidden).toBe(false);
    expect(canvas.classList.contains('screen--inspecting')).toBe(true);
    expect(document.activeElement).toBe(canvas);
    view.set(false);
    expect(view.active).toBe(false);
    expect(banner.hidden).toBe(true);
    expect(canvas.classList.contains('screen--inspecting')).toBe(false);
  });
});
