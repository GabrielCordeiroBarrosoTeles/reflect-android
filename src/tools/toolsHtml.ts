import { APP_LOCALES, BATTERY_MODES, FONT_SCALES } from '../appActions/deviceCommands';
import { createNonce } from '../ui/webviewHtml';

const FONT_LABELS: Readonly<Record<number, string>> = { 0.85: 'Small', 1: 'Default', 1.15: 'Large', 1.3: 'Larger', 1.5: 'Largest', 2: 'Huge' };

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

const networkPanel = `
    <section class="network" aria-label="Network">
      <div class="bar">
        <input class="network__search field" type="search" placeholder="Filter URL" aria-label="Filter URL" spellcheck="false">
        <select class="network__filter field field--narrow" aria-label="Status filter">
          <option value="all">All</option>
          <option value="2">2xx</option>
          <option value="3">3xx</option>
          <option value="4">4xx</option>
          <option value="5">5xx</option>
          <option value="failed">Failed</option>
        </select>
        <button class="icon-button network__pause" type="button" title="Pause capture" aria-label="Pause capture"><i class="codicon codicon-debug-pause"></i></button>
        <button class="icon-button network__clear" type="button" title="Clear" aria-label="Clear"><i class="codicon codicon-clear-all"></i></button>
      </div>
      <p class="summary network__summary" role="status"></p>
      <div class="placeholder network__empty">
        <i class="codicon codicon-globe"></i>
        <p class="network__message"></p>
      </div>
      <ul class="requests" role="listbox" aria-label="Requests" tabindex="0"></ul>
      <div class="request" hidden>
        <header class="request__header">
          <span class="request__method"></span>
          <span class="request__url"></span>
        </header>
        <p class="request__meta"></p>
        <nav class="segments" aria-label="Request details">
          <button class="segment" type="button" data-section="headers">Headers</button>
          <button class="segment" type="button" data-section="request">Request</button>
          <button class="segment" type="button" data-section="response">Response</button>
        </nav>
        <div class="request__body"></div>
        <div class="actions">
          <button class="button request__curl" type="button">Copy as cURL</button>
          <button class="button button--secondary request__copy" type="button">Copy response</button>
        </div>
      </div>
    </section>`;

const logsPanel = `
    <section class="logs" aria-label="Logs">
      <div class="bar">
        <input class="logs__search field" type="search" placeholder="Filter logs" aria-label="Filter logs" spellcheck="false">
        <select class="logs__level field field--narrow" aria-label="Minimum level">
          <option value="V">Verbose</option>
          <option value="D">Debug</option>
          <option value="I">Info</option>
          <option value="W">Warn</option>
          <option value="E">Error</option>
        </select>
        <button class="icon-button toggle-button logs__js" type="button" title="Only JavaScript logs" aria-label="Only JavaScript logs" aria-pressed="false"><i class="codicon codicon-symbol-event"></i></button>
        <button class="icon-button logs__pause" type="button" title="Pause logs" aria-label="Pause logs"><i class="codicon codicon-debug-pause"></i></button>
        <button class="icon-button logs__copy" type="button" title="Copy visible logs" aria-label="Copy visible logs"><i class="codicon codicon-copy"></i></button>
        <button class="icon-button logs__clear" type="button" title="Clear" aria-label="Clear"><i class="codicon codicon-clear-all"></i></button>
      </div>
      <p class="summary logs__summary" role="status"></p>
      <div class="placeholder logs__empty">
        <i class="codicon codicon-output"></i>
        <p class="logs__message"></p>
      </div>
      <ol class="log" aria-label="Log lines"></ol>
    </section>`;

const TOGGLE_TILES: readonly (readonly [setting: string, label: string, icon: string])[] = [
  ['darkMode', 'Dark mode', 'color-mode'],
  ['animations', 'Animations', 'sparkle'],
  ['showTouches', 'Show touches', 'target'],
  ['layoutBounds', 'Layout bounds', 'layout'],
  ['wifi', 'Wi-Fi', 'broadcast'],
  ['mobileData', 'Mobile data', 'radio-tower'],
  ['airplane', 'Airplane mode', 'rocket'],
];

const LOCALE_LABELS: Readonly<Record<string, string>> = { '': 'System default', 'pt-BR': 'Português (Brasil)', 'en-US': 'English (US)', 'es-ES': 'Español', 'fr-FR': 'Français' };

const BATTERY_LABELS: Readonly<Record<string, string>> = { reset: 'Real battery', critical: '5% · unplugged', low: '15% · unplugged', charging: '50% · charging', full: '100% · full' };

const toggleTile = ([setting, label, icon]: readonly [string, string, string]): string =>
  `<button class="tile" type="button" data-toggle="${setting}" aria-pressed="false"><i class="codicon codicon-${icon}"></i><span class="tile__label">${label}</span><span class="tile__state">Off</span></button>`;

const actionsPanel = `
    <section class="app-actions" aria-label="Actions">
      <p class="actions-result" role="status" hidden></p>
      <div class="placeholder actions__empty">
        <i class="codicon codicon-tools"></i>
        <p class="actions__message"></p>
      </div>
      <div class="actions__content" hidden>
        <details class="block" open>
          <summary class="subtitle">Deep link</summary>
          <form class="deep-link">
            <input class="deep-link__url field" type="text" placeholder="myapp://trip/42 or https://…" aria-label="Deep link" spellcheck="false" autocomplete="off">
            <button class="button" type="submit">Open</button>
          </form>
          <ul class="recent-links"></ul>
        </details>
        <details class="block" open>
          <summary class="subtitle">App <span class="actions__app"></span></summary>
          <div class="actions">
            <button class="button button--secondary app-control app__restart" type="button">Restart</button>
            <button class="button button--secondary app-control app__settings" type="button">App settings</button>
            <button class="button button--danger app-control app__clear" type="button">Clear data</button>
          </div>
          <label class="field-row"><span><i class="codicon codicon-globe"></i> App language</span><select class="setting-locale field field--narrow app-control">${APP_LOCALES.map((locale) => `<option value="${locale}">${String(LOCALE_LABELS[locale])}</option>`).join('')}</select></label>
        </details>
        <details class="block" open>
          <summary class="subtitle">Permissions <span class="permissions__summary"></span></summary>
          <ul class="permission-groups"></ul>
        </details>
        <details class="block" open>
          <summary class="subtitle">System</summary>
          <div class="tiles">
            ${TOGGLE_TILES.map(toggleTile).join('\n            ')}
            <label class="tile tile--select"><i class="codicon codicon-text-size"></i><span class="tile__label">Font size</span><select class="setting-font field">${FONT_SCALES.map((scale) => `<option value="${scale}">${String(FONT_LABELS[scale])}</option>`).join('')}</select></label>
            <label class="tile tile--select"><i class="codicon codicon-zap"></i><span class="tile__label">Battery <span class="battery__state"></span></span><select class="setting-battery field">${BATTERY_MODES.map((mode) => `<option value="${mode}">${String(BATTERY_LABELS[mode])}</option>`).join('')}</select></label>
          </div>
        </details>
        <div class="actions"><button class="button button--secondary actions__refresh" type="button">Refresh</button></div>
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
  { id: 'network', label: 'Network', icon: 'globe', panel: networkPanel },
  { id: 'logs', label: 'Logs', icon: 'output', panel: logsPanel },
  { id: 'storage', label: 'Storage', icon: 'database', panel: storagePanel },
  { id: 'device', label: 'Device', icon: 'device-mobile', panel: devicePanel },
  { id: 'actions', label: 'Actions', icon: 'tools', panel: actionsPanel },
] as const;

export const renderToolsHtml = ({ cspSource, scriptUri, styleUri }: ToolsHtmlAssets): string => {
  const nonce = createNonce();
  const buttons = TABS.map(
    ({ id, label, icon }) =>
      `<button id="tab-${id}" class="tab" type="button" role="tab" data-tab="${id}" aria-controls="panel-${id}" aria-selected="false" tabindex="-1" title="${label}" aria-label="${label}"${id === 'storage' || id === 'network' ? ' hidden' : ''}><i class="codicon codicon-${icon}" aria-hidden="true"></i><span class="tab__label">${label}</span></button>`,
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
