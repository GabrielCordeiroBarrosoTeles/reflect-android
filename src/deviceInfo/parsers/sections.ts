const MARKER = /^@@(\w+)$/;

export const splitSections = (output: string): ReadonlyMap<string, string> => {
  const sections = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const rawLine of output.split(/\r?\n/)) {
    const marker = MARKER.exec(rawLine.trim());
    if (marker) {
      current = [];
      sections.set(marker[1] as string, current);
      continue;
    }
    current?.push(rawLine);
  }
  return new Map([...sections].map(([name, lines]) => [name, lines.join('\n').trim()]));
};

export const keyValues = (text: string): ReadonlyMap<string, string> => {
  const entries = new Map<string, string>();
  for (const line of text.split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      entries.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
    }
  }
  return entries;
};

export const toNumber = (value: string | undefined): number | undefined => {
  if (value === undefined || value.trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
