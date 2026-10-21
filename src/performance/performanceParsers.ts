import type { FrameStats, PerformanceReading } from './types';

const FOREGROUND_PACKAGE = "pkg=$(dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity | grep -oE '[A-Za-z0-9_.]+/' | head -n1 | tr -d /)";
const PACKAGE = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export const PERFORMANCE_COMMAND = [
  FOREGROUND_PACKAGE,
  'pid=$(pidof "$pkg")',
  'echo "@@app $pkg $pid"',
  '[ -n "$pid" ] && { echo @@top; top -b -n 1 -p "$pid" -o %CPU,RES; echo @@mem; dumpsys meminfo "$pid" | grep -E "TOTAL PSS|TOTAL:"; echo @@gfx; dumpsys gfxinfo "$pkg" | grep -E "Total frames rendered|Janky frames|percentile"; }',
].join('; ');

export const resetFramesCommand = (app: string): string | undefined => (PACKAGE.test(app) ? `dumpsys gfxinfo ${app} reset > /dev/null` : undefined);

const sections = (text: string): Map<string, string> => {
  const result = new Map<string, string>();
  let name = '';
  for (const line of text.split(/\r?\n/)) {
    const marker = /^@@(\w+)\s*(.*)$/.exec(line);
    if (marker) {
      name = String(marker[1]);
      result.set(name, String(marker[2]));
    } else {
      result.set(name, `${result.get(name) ?? ''}${line}\n`);
    }
  }
  return result;
};

const numberFrom = (text: string, pattern: RegExp): number | undefined => {
  const value = Number.parseFloat(pattern.exec(text)?.[1] ?? '');
  return Number.isFinite(value) ? value : undefined;
};

export const parseCpu = (text: string): number | undefined => {
  const capacity = numberFrom(text, /(\d+)%cpu/) ?? 100;
  const lines = text.trim().split('\n');
  const usage = numberFrom(String(lines.at(-1)), /^\s*([\d.]+)\s+\S+\s*$/);
  return usage === undefined ? undefined : Math.round((usage / capacity) * 1000) / 10;
};

export const parseMemoryKb = (text: string): number | undefined => numberFrom(text, /TOTAL PSS:\s*(\d+)/) ?? numberFrom(text, /TOTAL:\s*(\d+)/);

export const parseFrames = (text: string): FrameStats | undefined => {
  const total = numberFrom(text, /Total frames rendered:\s*(\d+)/);
  if (total === undefined) {
    return undefined;
  }
  return {
    total,
    janky: numberFrom(text, /Janky frames:\s*(\d+)/) ?? 0,
    p50: numberFrom(text, /50th percentile:\s*(\d+)/),
    p90: numberFrom(text, /90th percentile:\s*(\d+)/),
    p99: numberFrom(text, /99th percentile:\s*(\d+)/),
  };
};

export const parsePerformance = (text: string): PerformanceReading => {
  const parts = sections(text);
  const [app, pid] = (parts.get('app') ?? '').trim().split(/\s+/);
  return {
    app: app || undefined,
    pid: pid ? Number(pid) : undefined,
    cpu: parseCpu(parts.get('top') ?? ''),
    memoryKb: parseMemoryKb(parts.get('mem') ?? ''),
    frames: parseFrames(parts.get('gfx') ?? ''),
  };
};
