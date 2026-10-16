import type { InspectedComponent, InspectedProp, SourceLocation } from './types';

const MAX_VALUE_LENGTH = 120;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const truncate = (text: string): string => (text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text);

export const formatPropValue = (value: unknown): string => {
  if (isRecord(value) && typeof value.preview_long === 'string') {
    return truncate(value.preview_long);
  }
  if (typeof value === 'string') {
    return truncate(JSON.stringify(value));
  }
  if (typeof value === 'function') {
    return 'ƒ()';
  }
  return truncate(String(JSON.stringify(value)));
};

const isUndefinedValue = (value: unknown): boolean => value === undefined || (isRecord(value) && value.type === 'undefined');

const readProps = (props: unknown): InspectedProp[] => {
  const data = isRecord(props) && isRecord(props.data) ? props.data : props;
  if (!isRecord(data)) {
    return [];
  }
  return Object.entries(data)
    .filter(([, value]) => !isUndefinedValue(value))
    .map(([name, value]) => ({ name, value: formatPropValue(value) }));
};

const readOwners = (owners: unknown): string[] =>
  Array.isArray(owners)
    ? owners.flatMap((owner) => (isRecord(owner) && typeof owner.displayName === 'string' ? [owner.displayName] : []))
    : [];

export const toInspectedComponent = (payload: Record<string, unknown>, source: SourceLocation | undefined): InspectedComponent | undefined => {
  if (payload.type !== 'full-data' || !isRecord(payload.value)) {
    return undefined;
  }
  const value = payload.value;
  const owners = readOwners(value.owners);
  const name = typeof value.displayName === 'string' ? value.displayName : (owners[0] ?? 'Unknown');
  return { name, props: readProps(value.props), owners, source };
};
