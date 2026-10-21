import type { LogLevel, LogLine, LogRead } from './types';

const LINE = /^(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?)\s*: (.*)$/;
const APP = /^@@app\s*(\S*)\s*(\d*)/m;
const TIMESTAMP = /^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/;
const FIRST_READ_LINES = 300;

type ParsedLine = Omit<LogLine, 'id'>;

const sameEntry = (a: ParsedLine, b: ParsedLine): boolean => a.time === b.time && a.pid === b.pid && a.tid === b.tid && a.level === b.level && a.tag === b.tag;

export const parseLogcat = (text: string): LogRead => {
  const app = APP.exec(text);
  const lines: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = LINE.exec(raw);
    if (!match) {
      continue;
    }
    const line: ParsedLine = { time: String(match[1]), pid: Number(match[2]), tid: Number(match[3]), level: match[4] as LogLevel, tag: String(match[5]), message: String(match[6]) };
    const previous = lines.at(-1);
    if (previous && sameEntry(previous, line)) {
      lines[lines.length - 1] = { ...previous, message: `${previous.message}\n${line.message}` };
    } else {
      lines.push(line);
    }
  }
  return { app: app?.[1] || undefined, pid: app?.[2] ? Number(app[2]) : undefined, lines };
};

const FOREGROUND_PACKAGE = "pkg=$(dumpsys activity activities 2>/dev/null | grep -m1 topResumedActivity | grep -oE '[A-Za-z0-9_.]+/' | head -n1 | tr -d /)";

export const buildLogcatCommand = (since: string | undefined): string => {
  const filter = since !== undefined && TIMESTAMP.test(since) ? `-T '${since}'` : `-t ${FIRST_READ_LINES}`;
  return `${FOREGROUND_PACKAGE}; pid=$(pidof "$pkg"); echo "@@app $pkg $pid"; [ -n "$pid" ] && logcat -d -v threadtime ${filter} --pid=$pid`;
};
