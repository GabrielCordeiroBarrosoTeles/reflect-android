import { describe, expect, it, vi } from 'vitest';
import { buildLogcatCommand, parseLogcat } from '../../src/logs/logcat';
import { LogReader } from '../../src/logs/LogReader';
import { LOGCAT_OUTPUT } from './fixtures';

describe('logcat', () => {
  it('parses real threadtime output, skipping headers and grouping multi-line entries', () => {
    const { app, pid, lines } = parseLogcat(LOGCAT_OUTPUT);
    expect([app, pid, lines.length]).toEqual(['br.com.client.hmlqa', 10868, 7]);
    expect(lines[0]).toEqual({ time: '10-21 09:06:17.026', pid: 10868, tid: 18336, level: 'E', tag: 'ReactNativeJS', message: '[Error: Expected mounted root to have known pseudo key.]' });
    expect(lines[5]?.message).toBe('FATAL EXCEPTION: main\njava.lang.IllegalStateException: boom\n\tat com.example.Main.run(Main.java:12)');
    expect(lines.at(-1)).toMatchObject({ level: 'I', tag: 'ReactNativeJS', message: "'trip accepted', { id: 42 }" });
  });

  it('reports when there is no foreground app or pid', () => {
    expect(parseLogcat('@@app  ')).toEqual({ app: undefined, pid: undefined, lines: [] });
    expect(parseLogcat('@@app com.x ')).toEqual({ app: 'com.x', pid: undefined, lines: [] });
    expect(parseLogcat('garbage')).toEqual({ app: undefined, pid: undefined, lines: [] });
  });

  it('reads recent lines first and then only newer ones, refusing unsafe timestamps', () => {
    expect(buildLogcatCommand(undefined)).toMatch(/logcat -d -v threadtime -t 300 --pid=\$pid$/);
    expect(buildLogcatCommand('10-21 09:06:24.200')).toContain("-T '10-21 09:06:24.200'");
    expect(buildLogcatCommand("x'; reboot; '")).toContain('-t 300');
    expect(buildLogcatCommand(undefined)).toContain('topResumedActivity');
  });

  it('runs the command on the device shell', async () => {
    const shell = { run: vi.fn((_serial: string, _command: string) => Promise.resolve(LOGCAT_OUTPUT)) };
    const result = await new LogReader(shell).read('A', '10-21 09:06:24.200');
    expect(result.lines).toHaveLength(7);
    expect(shell.run.mock.calls[0]?.[0]).toBe('A');
  });
});
