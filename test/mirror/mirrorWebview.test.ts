import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { applyMirrorWebview, mirrorWebviewOptions } from '../../src/mirror/mirrorWebview';
import { FakeWebview } from '../mocks/vscode';

describe('mirrorWebview', () => {
  it('enables scripts limited to the dist folder', () => {
    expect(mirrorWebviewOptions(vscode.Uri.file('/ext'))).toEqual({
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(vscode.Uri.file('/ext'), 'dist')],
    });
  });

  it('renders the mirror page with webview URIs for the bundle', () => {
    const webview = new FakeWebview();
    applyMirrorWebview(webview as unknown as vscode.Webview, vscode.Uri.file('/ext'));
    expect(webview.html).toContain('src="webview:/ext/dist/webview.js"');
    expect(webview.html).toContain('href="webview:/ext/dist/webview.css"');
    expect(webview.html).toContain('style-src vscode-resource:');
  });
});
