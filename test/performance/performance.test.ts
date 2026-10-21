import { describe, expect, it, vi } from 'vitest';
import { parseCpu, parseFrames, parseMemoryKb, parsePerformance, PERFORMANCE_COMMAND, resetFramesCommand } from '../../src/performance/performanceParsers';
import { PerformanceReader } from '../../src/performance/PerformanceReader';
import { PERFORMANCE_OUTPUT } from './fixtures';

describe('performance parsers', () => {
  it('reads CPU, memory and frame stats from the device output', () => {
    expect(parsePerformance(PERFORMANCE_OUTPUT)).toEqual({
      app: 'br.com.client.hmlqa',
      pid: 5855,
      cpu: 6,
      memoryKb: 51558,
      frames: { total: 82189, janky: 35335, p50: 34, p90: 34, p99: 69 },
    });
    expect(PERFORMANCE_COMMAND).toContain('top -b -n 1 -p "$pid" -o %CPU,RES');
  });

  it('copes with missing or older formats', () => {
    expect(parsePerformance('@@app ')).toEqual({ app: undefined, pid: undefined, cpu: undefined, memoryKb: undefined, frames: undefined });
    expect(parsePerformance('')).toMatchObject({ app: undefined, pid: undefined });
    expect([parseCpu(' %CPU  RES\n 25.0 100M'), parseCpu('nothing here'), parseCpu('')]).toEqual([25, undefined, undefined]);
    expect([parseMemoryKb('        TOTAL:    40000    TOTAL SWAP'), parseMemoryKb('x')]).toEqual([40000, undefined]);
    expect(parseFrames('Total frames rendered: 10')).toEqual({ total: 10, janky: 0, p50: undefined, p90: undefined, p99: undefined });
  });

  it('builds a safe frame reset command', () => {
    expect([resetFramesCommand('br.com.client.hmlqa'), resetFramesCommand('x; reboot')]).toEqual(['dumpsys gfxinfo br.com.client.hmlqa reset > /dev/null', undefined]);
  });

  it('reads and resets through the device shell', async () => {
    const shell = { run: vi.fn((_serial: string, _command: string) => Promise.resolve(PERFORMANCE_OUTPUT)) };
    const reader = new PerformanceReader(shell);
    expect((await reader.read('A')).memoryKb).toBe(51558);
    await reader.resetFrames('A', 'br.com.client.hmlqa');
    await reader.resetFrames('A', 'bad app');
    expect(shell.run.mock.calls.map(([, command]) => command)).toEqual([PERFORMANCE_COMMAND, 'dumpsys gfxinfo br.com.client.hmlqa reset > /dev/null']);
  });
});
