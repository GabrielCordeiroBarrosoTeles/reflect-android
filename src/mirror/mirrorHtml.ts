import { createNonce } from '../ui/webviewHtml';

export interface MirrorHtmlAssets {
  readonly cspSource: string;
  readonly scriptUri: string;
  readonly styleUri: string;
}

export const renderMirrorHtml = ({ cspSource, scriptUri, styleUri }: MirrorHtmlAssets): string => {
  const nonce = createNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} blob: data:; style-src ${cspSource}; font-src ${cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <nav class="toolbar" aria-label="Device controls"></nav>
  <div class="inspect-banner" role="status" hidden>Click a component to inspect · Esc to cancel</div>
  <main class="stage">
    <canvas class="screen" tabindex="0" aria-label="Device screen" hidden></canvas>
    <div class="inspect-highlight" aria-hidden="true" hidden><span class="inspect-highlight__label"></span></div>
    <div class="status" role="status">
      <span class="status__title"></span>
      <span class="status__detail"></span>
      <button class="status__action" type="button" hidden>Open Device</button>
    </div>
  </main>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
};
