import { describe, expect, it, vi } from 'vitest';
import { SimulatorPasteboard } from '../../src/ios/SimulatorPasteboard';
import type { ISimctl } from '../../src/ios/types';

const setup = (initial = '') => {
  let board = initial;
  const simctl: ISimctl = {
    run: vi.fn((args: readonly string[], input?: string) => {
      if (args[0] === 'pbcopy') {
        board = input ?? '';
      }
      return Promise.resolve(args[0] === 'pbpaste' ? board : '');
    }),
  };
  const pasteboard = new SimulatorPasteboard(simctl, 'UDID-1');
  const changes: string[] = [];
  pasteboard.onDidChange((text) => changes.push(text));
  return { pasteboard, simctl, changes, setBoard: (text: string) => (board = text) };
};

describe('SimulatorPasteboard', () => {
  it('reports changes after the first read as the baseline, ignoring empty reads', async () => {
    const { pasteboard, simctl, changes, setBoard } = setup('initial');
    await pasteboard.poll();
    await pasteboard.poll();
    setBoard('copied');
    await pasteboard.poll();
    setBoard('');
    await pasteboard.poll();
    expect(simctl.run).toHaveBeenCalledWith(['pbpaste', 'UDID-1']);
    expect(changes).toEqual(['copied']);
  });

  it('records pushed text as the baseline so it is never reported back', async () => {
    const { pasteboard, simctl, changes } = setup('initial');
    await pasteboard.poll();
    const use = vi.fn(() => Promise.resolve());
    await pasteboard.push('host', use);
    await pasteboard.poll();
    expect(simctl.run).toHaveBeenCalledWith(['pbcopy', 'UDID-1'], 'host');
    expect(use).toHaveBeenCalledOnce();
    expect(changes).toEqual([]);
  });

  it('lends the pasteboard for a paste and puts the previous contents back', async () => {
    const { pasteboard, simctl, changes } = setup('mine');
    let during = '';
    await pasteboard.lend('ação', async () => {
      during = await simctl.run(['pbpaste', 'UDID-1']);
    });
    await pasteboard.poll();
    expect(during).toBe('ação');
    expect(simctl.run).toHaveBeenLastCalledWith(['pbpaste', 'UDID-1']);
    expect(changes).toEqual([]);
  });

  it('reports a device copy noticed just before a lend instead of swallowing it', async () => {
    const { pasteboard, changes, setBoard } = setup('old');
    await pasteboard.poll();
    setBoard('device copy');
    await pasteboard.lend('ç', () => Promise.resolve());
    expect(changes).toEqual(['device copy']);
  });

  it('skips the restore when the previous contents could not be read', async () => {
    const { pasteboard, simctl } = setup();
    vi.mocked(simctl.run).mockRejectedValueOnce(new Error('pbpaste failed'));
    await pasteboard.lend('ç', () => Promise.resolve());
    expect(vi.mocked(simctl.run).mock.calls.filter(([args]) => args[0] === 'pbcopy')).toEqual([[['pbcopy', 'UDID-1'], 'ç']]);
  });

  it('never runs a poll in the middle of a lend', async () => {
    const { pasteboard, changes, setBoard } = setup('mine');
    await pasteboard.poll();
    let release!: () => void;
    const lent = pasteboard.lend('ç', () => new Promise<void>((resolve) => (release = resolve)));
    const polled = pasteboard.poll();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await Promise.all([lent, polled]);
    setBoard('mine');
    expect(changes).toEqual([]);
  });

  it('keeps serving after a failed operation and stops reporting once disposed', async () => {
    const { pasteboard, simctl, changes, setBoard } = setup('a');
    vi.mocked(simctl.run).mockRejectedValueOnce(new Error('pbpaste failed'));
    await expect(pasteboard.poll()).rejects.toThrow('pbpaste failed');
    await pasteboard.poll();
    pasteboard.dispose();
    setBoard('b');
    await pasteboard.poll();
    expect(changes).toEqual([]);
  });
});
