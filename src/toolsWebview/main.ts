import '@vscode/codicons/dist/codicon.css';
import './tools.css';
import type { HostToToolsMessage } from '../shared/toolsProtocol';
import { ComponentTab } from './ComponentTab';
import { DeviceTab } from './DeviceTab';
import { query } from './dom';
import { StoragePanel } from './storage/StoragePanel';
import { TabBar } from './TabBar';
import type { ToolsApi } from './types';

const api = (globalThis as unknown as { acquireVsCodeApi(): ToolsApi }).acquireVsCodeApi();
const post = api.postMessage.bind(api);
const component = new ComponentTab(query(document, '.component'), post);
const device = new DeviceTab(query(document, '.device'), post);
const storage = new StoragePanel(query(document, '.storage'), post);
const tabs = new TabBar(document, { get: () => api.getState(), set: (state) => api.setState(state) }, (tab) => post({ type: 'tab-changed', tab }));

const receive = (message: HostToToolsMessage): void => {
  switch (message.type) {
    case 'storage-available':
      tabs.setAvailable('storage', message.available);
      break;
    case 'select-tab':
      tabs.select(message.tab, false);
      break;
    case 'component':
      component.render(message.view);
      break;
    case 'device':
      device.render(message.state);
      break;
    case 'storage-state':
      storage.render(message.state);
      break;
    case 'storage-saved':
      storage.saved(message.key);
      break;
    case 'storage-new-key':
      storage.openNewKeyForm();
      break;
  }
};

window.addEventListener('message', (event: MessageEvent<HostToToolsMessage>) => receive(event.data));
post({ type: 'ready' });
tabs.start();
