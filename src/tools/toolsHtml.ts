import { createNonce } from '../ui/webviewHtml';

export interface ToolsHtmlAssets {
  readonly cspSource: string;
  readonly scriptUri: string;
  readonly styleUri: string;
}

const componentPanel = `
    <section class="component" aria-label="Component">
      <div class="placeholder component__empty">
        <i class="codicon codicon-inspect"></i>
        <p>Click <strong>Inspect</strong>, then a component on the device.</p>
      </div>
      <div class="component__details" hidden>
        <header class="component__header">
          <span class="component__name"></span>
          <button class="link component__source" type="button" title="Open source"></button>
        </header>
        <h3 class="subtitle component__props-title">Props</h3>
        <dl class="pairs component__props"></dl>
        <h3 class="subtitle">Rendered by</h3>
        <ol class="owners component__owners"></ol>
      </div>
    </section>`;

const devicePanel = `
    <section class="device" aria-label="Device info">
      <div class="placeholder device__empty">
        <i class="codicon codicon-device-mobile"></i>
        <p class="device__message">Open a device to see its details.</p>
      </div>
      <div class="device__groups"></div>
    </section>`;

const storagePanel = `
    <section class="storage" aria-label="AsyncStorage">
      <div class="bar">
        <input class="search field" type="search" placeholder="Filter keys" aria-label="Filter keys" spellcheck="false">
        <button class="icon-button add" type="button" title="Add key" aria-label="Add key"><i class="codicon codicon-add"></i></button>
      </div>
      <form class="new-key" hidden>
        <input class="new-key__key field" type="text" placeholder="Key" aria-label="New key" spellcheck="false">
        <textarea class="new-key__value field field--code" rows="3" placeholder="Value (text or JSON)" aria-label="New value" spellcheck="false"></textarea>
        <p class="new-key__error" role="alert" hidden></p>
        <div class="actions">
          <button class="button" type="submit">Create</button>
          <button class="button button--secondary new-key__cancel" type="button">Cancel</button>
        </div>
      </form>
      <p class="summary" role="status"></p>
      <ul class="keys" role="listbox" aria-label="AsyncStorage keys" tabindex="0"></ul>
      <div class="empty" hidden>
        <p class="empty__title"></p>
        <p class="empty__detail"></p>
        <button class="button empty__retry" type="button" hidden>Retry</button>
      </div>
      <div class="editor" hidden>
        <header class="editor__header">
          <span class="editor__key"></span>
          <span class="editor__type"></span>
        </header>
        <textarea class="editor__value field field--code" spellcheck="false" aria-label="Value" readonly></textarea>
        <p class="editor__hint" role="status"></p>
        <figure class="preview" hidden>
          <img class="preview__image" alt="Image preview">
          <figcaption class="preview__caption"></figcaption>
        </figure>
        <div class="actions">
          <button class="button editor__edit" type="button">Edit</button>
          <button class="button editor__save" type="button" title="Save (Ctrl/Cmd+S)" hidden>Save</button>
          <button class="button button--secondary editor__cancel" type="button" hidden>Cancel</button>
          <button class="button button--secondary editor__copy" type="button">Copy</button>
          <button class="button button--danger editor__delete" type="button">Delete</button>
        </div>
      </div>
    </section>`;

const TABS = [
  { id: 'component', label: 'Component', icon: 'inspect', panel: componentPanel },
  { id: 'device', label: 'Device', icon: 'device-mobile', panel: devicePanel },
  { id: 'storage', label: 'Storage', icon: 'database', panel: storagePanel },
] as const;

export const renderToolsHtml = ({ cspSource, scriptUri, styleUri }: ToolsHtmlAssets): string => {
  const nonce = createNonce();
  const buttons = TABS.map(
    ({ id, label, icon }) =>
      `<button id="tab-${id}" class="tab" type="button" role="tab" data-tab="${id}" aria-controls="panel-${id}" aria-selected="false" tabindex="-1" title="${label}" aria-label="${label}"${id === 'storage' ? ' hidden' : ''}><i class="codicon codicon-${icon}" aria-hidden="true"></i><span class="tab__label">${label}</span></button>`,
  ).join('\n    ');
  const panels = TABS.map(({ id, panel }) => `<div id="panel-${id}" class="panel" role="tabpanel" aria-labelledby="tab-${id}" data-tab="${id}" hidden>${panel}\n  </div>`).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src ${cspSource}; font-src ${cspSource}; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <nav class="tabs" role="tablist" aria-label="Reflect tools">
    ${buttons}
  </nav>
  ${panels}
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
};
