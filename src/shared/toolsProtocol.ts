import type { InfoGroup } from '../deviceInfo/types';
import type { SourceLocation } from '../inspector/types';
import type { NetworkEntry } from '../network/types';
import type { StorageEntry } from '../storage/types';

export type ToolsTab = 'component' | 'network' | 'storage' | 'device';

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

export type HostToToolsMessage =
  | { readonly type: 'app-available'; readonly available: boolean }
  | { readonly type: 'select-tab'; readonly tab: ToolsTab }
  | { readonly type: 'component'; readonly view: ComponentPanelView | undefined }
  | { readonly type: 'device'; readonly state: DevicePanelState }
  | { readonly type: 'storage-state'; readonly state: StoragePanelState }
  | { readonly type: 'storage-saved'; readonly key: string }
  | { readonly type: 'storage-new-key' }
  | { readonly type: 'network-status'; readonly status: NetworkStatus }
  | { readonly type: 'network-entries'; readonly entries: readonly NetworkEntry[]; readonly reset: boolean };

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
  | { readonly type: 'network-clear' };
