import type { AppPermission, PermissionGroup } from './types';

interface GroupDefinition {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly matches: RegExp;
}

const GROUPS: readonly GroupDefinition[] = [
  { id: 'location', label: 'Location', icon: 'location', matches: /LOCATION/ },
  { id: 'camera', label: 'Camera', icon: 'device-camera', matches: /\.CAMERA$/ },
  { id: 'microphone', label: 'Microphone', icon: 'mic', matches: /RECORD_AUDIO/ },
  { id: 'notifications', label: 'Notifications', icon: 'bell', matches: /POST_NOTIFICATIONS/ },
  { id: 'contacts', label: 'Contacts', icon: 'person', matches: /CONTACTS|GET_ACCOUNTS/ },
  { id: 'phone', label: 'Phone', icon: 'call-outgoing', matches: /PHONE|CALL_LOG|ANSWER_PHONE_CALLS|USE_SIP/ },
  { id: 'sms', label: 'SMS', icon: 'comment', matches: /SMS|MMS|WAP_PUSH/ },
  { id: 'media', label: 'Photos and files', icon: 'folder', matches: /STORAGE|READ_MEDIA/ },
  { id: 'nearby', label: 'Nearby devices', icon: 'broadcast', matches: /BLUETOOTH|NEARBY_WIFI|UWB_RANGING/ },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', matches: /CALENDAR/ },
  { id: 'activity', label: 'Physical activity and sensors', icon: 'pulse', matches: /ACTIVITY_RECOGNITION|BODY_SENSORS/ },
];

const OTHER: Omit<GroupDefinition, 'matches'> = { id: 'other', label: 'Other', icon: 'shield' };

const LAST = /BACKGROUND/;

export const groupPermissions = (permissions: readonly AppPermission[]): PermissionGroup[] => {
  const groups = new Map<string, { definition: Omit<GroupDefinition, 'matches'>; permissions: AppPermission[] }>();
  for (const permission of permissions) {
    const definition = GROUPS.find(({ matches }) => matches.test(permission.name)) ?? OTHER;
    const group = groups.get(definition.id) ?? { definition, permissions: [] };
    group.permissions.push(permission);
    groups.set(definition.id, group);
  }
  const order = [...GROUPS, OTHER].map(({ id }) => id);
  return [...groups.values()]
    .sort((a, b) => order.indexOf(a.definition.id) - order.indexOf(b.definition.id))
    .map(({ definition: { id, label, icon }, permissions: members }) => ({
      id,
      label,
      icon,
      permissions: [...members].sort((a, b) => Number(LAST.test(a.name)) - Number(LAST.test(b.name))),
    }));
};

export const permissionLabel = (name: string): string => {
  const short = name.replace(/^android\.permission\./, '').replace(/_/g, ' ').toLowerCase();
  return short.charAt(0).toUpperCase() + short.slice(1);
};
