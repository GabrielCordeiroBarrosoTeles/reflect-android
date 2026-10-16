import * as vscode from 'vscode';
import { renderMirrorHtml } from './mirrorHtml';

export const mirrorWebviewOptions = (extensionUri: vscode.Uri): vscode.WebviewOptions => ({
  enableScripts: true,
  localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist')],
});

export const applyMirrorWebview = (webview: vscode.Webview, extensionUri: vscode.Uri): void => {
  const distUri = vscode.Uri.joinPath(extensionUri, 'dist');
  webview.html = renderMirrorHtml({
    cspSource: webview.cspSource,
    scriptUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.js')).toString(),
    styleUri: webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'webview.css')).toString(),
  });
};
