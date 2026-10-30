import { describe, expect, it } from 'vitest';
import { renderMirrorHtml } from '../../src/mirror/mirrorHtml';

const render = () =>
  renderMirrorHtml({ cspSource: 'vscode-resource:', scriptUri: 'webview:/dist/webview.js', styleUri: 'webview:/dist/webview.css' });

describe('renderMirrorHtml', () => {
  it('declares a restrictive CSP bound to a nonce', () => {
    const html = render();
    const nonce = /script-src 'nonce-([^']+)'/.exec(html)?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('style-src vscode-resource:');
    expect(html).toContain('font-src vscode-resource:');
    expect(html).toContain('<nav class="toolbar" aria-label="Device controls"></nav>');
    expect(html).toContain(`<script type="module" nonce="${nonce}" src="webview:/dist/webview.js"></script>`);
    expect(html).toContain('<link rel="stylesheet" href="webview:/dist/webview.css">');
  });

  it('generates a fresh nonce on every render', () => {
    const nonceOf = (html: string) => /nonce-([^']+)'/.exec(html)?.[1];
    expect(nonceOf(render())).not.toBe(nonceOf(render()));
  });

  it('renders a focusable canvas and the status overlay', () => {
    const html = render();
    expect(html).toContain('<canvas class="screen" tabindex="0"');
    expect(html).toContain('class="status__title"');
    expect(html).toContain('class="status__detail"');
    expect(html).toContain('<div class="status__devices"></div>');
    expect(html).toContain('<button class="status__action" type="button" hidden>Open Device</button>');
    expect(html).toContain('<button class="status__link" type="button" hidden>Show in Simulator</button>');
    expect(html).toContain('class="inspect-banner" role="status" hidden');
  });
});
