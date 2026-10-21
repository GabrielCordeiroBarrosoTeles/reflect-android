import '@vscode/codicons/dist/codicon.css';
import './tools.css';
import type { HostToToolsMessage } from '../shared/toolsProtocol';
import { ComponentTab } from './ComponentTab';
import { DeviceTab } from './DeviceTab';
import { ActionsPanel } from './actions/ActionsPanel';
import { LogsPanel } from './logs/LogsPanel';
import { NetworkPanel } from './network/NetworkPanel';
import { PerformancePanel } from './performance/PerformancePanel';
import { query } from './dom';
import { StoragePanel } from './storage/StoragePanel';
import { TabBar } from './TabBar';
import type { ToolsApi } from './types';

const api = (globalThis as unknown as { acquireVsCodeApi(): ToolsApi }).acquireVsCodeApi();
const post = api.postMessage.bind(api);
const component = new ComponentTab(query(document, '.component'), post);
const device = new DeviceTab(query(document, '.device'), post);
const storage = new StoragePanel(query(document, '.storage'), post);
const network = new NetworkPanel(query(document, '.network'), post);
const logs = new LogsPanel(query(document, '.logs'), post);
const actions = new ActionsPanel(query(document, '.app-actions'), post);
const performance = new PerformancePanel(query(document, '.performance'), post);
const tabs = new TabBar(document, { get: () => api.getState(), set: (state) => api.setState(state) }, (tab) => post({ type: 'tab-changed', tab }));

const receive = (message: HostToToolsMessage): void => {
  switch (message.type) {
    case 'app-available':
      tabs.setAvailable('network', message.available);
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
    case 'network-status':
      network.setStatus(message.status);
      break;
    case 'network-entries':
      network.update(message.entries, message.reset);
      break;
    case 'logs-status':
      logs.setStatus(message.status);
      break;
    case 'logs-lines':
      logs.add(message.lines, message.reset);
      break;
    case 'actions-state':
      actions.render(message.state);
      break;
    case 'actions-result':
      actions.showResult(message.ok, message.message);
      break;
    case 'performance-status':
      performance.setStatus(message.status);
      break;
    case 'performance-points':
      performance.add(message.points, message.reset);
      break;
  }
};

window.addEventListener('message', (event: MessageEvent<HostToToolsMessage>) => receive(event.data));
post({ type: 'ready' });
tabs.start();
