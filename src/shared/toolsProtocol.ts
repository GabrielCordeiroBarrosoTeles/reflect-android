import type { InfoGroup } from '../deviceInfo/types';
import type { SourceLocation } from '../inspector/types';
import type { ActionsSnapshot, AppAction } from '../appActions/types';
import type { LogLine } from '../logs/types';
import type { NetworkEntry } from '../network/types';
import type { PerformancePoint } from '../performance/types';
import type { StorageEntry } from '../storage/types';

export type ToolsTab = 'component' | 'network' | 'logs' | 'storage' | 'device' | 'performance' | 'actions';

export interface ComponentPanelView {
  readonly name: string;
  readonly location: string | undefined;
  readonly source: SourceLocation | undefined;
  readonly props: readonly { readonly name: string; readonly value: string }[];
  readonly owners: readonly string[];
}

export type DevicePanelState = { readonly kind: 'idle' } | { readonly kind: 'failed' } | { readonly kind: 'loaded'; readonly groups: readonly InfoGroup[] };

export type StoragePanelState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly entries: readonly StorageEntry[] }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

export type NetworkStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'capturing' }
  | { readonly kind: 'paused' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed'; readonly message: string };

export type LogsStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'capturing'; readonly app: string }
  | { readonly kind: 'paused' }
  | { readonly kind: 'no-app' }
  | { readonly kind: 'failed'; readonly message: string };

export type ActionsState =
  | { readonly kind: 'idle' }
  | ({ readonly kind: 'ready'; readonly links: readonly string[]; readonly wirelessAdb: boolean } & ActionsSnapshot)
  | { readonly kind: 'failed'; readonly message: string };

export type PerformanceStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sampling'; readonly app: string }
  | { readonly kind: 'paused' }
  | { readonly kind: 'no-app' }
  | { readonly kind: 'failed'; readonly message: string };

export type HostToToolsMessage =
  | { readonly type: 'app-available'; readonly available: boolean }
  | { readonly type: 'select-tab'; readonly tab: ToolsTab }
  | { readonly type: 'component'; readonly view: ComponentPanelView | undefined }
  | { readonly type: 'device'; readonly state: DevicePanelState }
  | { readonly type: 'storage-state'; readonly state: StoragePanelState }
  | { readonly type: 'storage-saved'; readonly key: string }
  | { readonly type: 'storage-new-key' }
  | { readonly type: 'network-status'; readonly status: NetworkStatus }
  | { readonly type: 'network-entries'; readonly entries: readonly NetworkEntry[]; readonly reset: boolean }
  | { readonly type: 'logs-status'; readonly status: LogsStatus }
  | { readonly type: 'logs-lines'; readonly lines: readonly LogLine[]; readonly reset: boolean }
  | { readonly type: 'actions-state'; readonly state: ActionsState }
  | { readonly type: 'actions-result'; readonly ok: boolean; readonly message: string }
  | { readonly type: 'performance-status'; readonly status: PerformanceStatus }
  | { readonly type: 'performance-points'; readonly points: readonly PerformancePoint[]; readonly reset: boolean };

export type ToolsToHostMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'tab-changed'; readonly tab: ToolsTab }
  | { readonly type: 'copy'; readonly text: string }
  | { readonly type: 'open-source'; readonly source: SourceLocation }
  | { readonly type: 'device-refresh' }
  | { readonly type: 'storage-refresh' }
  | { readonly type: 'storage-save'; readonly key: string; readonly value: string }
  | { readonly type: 'storage-create'; readonly key: string; readonly value: string }
  | { readonly type: 'storage-delete'; readonly key: string }
  | { readonly type: 'network-pause'; readonly paused: boolean }
  | { readonly type: 'network-clear' }
  | { readonly type: 'logs-pause'; readonly paused: boolean }
  | { readonly type: 'logs-clear' }
  | { readonly type: 'actions-run'; readonly action: AppAction }
  | { readonly type: 'actions-refresh' }
  | { readonly type: 'performance-pause'; readonly paused: boolean }
  | { readonly type: 'performance-reset' };
