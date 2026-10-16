import { describe, expect, it, vi } from 'vitest';
import { CLIPBOARD_COMMANDS, SystemClipboard } from '../../src/capture/SystemClipboard';
import { FakeProcessRunner } from '../fakes/FakeProcessRunner';

const setup = (platform: NodeJS.Platform) => {
  const runner = new FakeProcessRunner();
  const copyText = vi.fn(() => Promise.resolve());
  return { runner, copyText, clipboard: new SystemClipboard(platform, runner, copyText) };
};

describe('SystemClipboard', () => {
  it('copies screenshots as PNG images on macOS, passing the path as an argument', async () => {
    const { clipboard, runner } = setup('darwin');
    expect(await clipboard.copy('screenshot', '/c/shot "1".png')).toBe('copied');
    expect(runner.calls[0]).toEqual({
      executable: 'osascript',
      args: ['-e', 'on run argv', '-e', 'set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)', '-e', 'end run', '/c/shot "1".png'],
    });
  });

  it('copies recordings as files on macOS', async () => {
    const { clipboard, runner } = setup('darwin');
    await clipboard.copy('recording', '/c/clip.mp4');
    expect(runner.calls[0]?.args).toContain('set the clipboard to (POSIX file (item 1 of argv))');
    expect(runner.calls[0]?.args.at(-1)).toBe('/c/clip.mp4');
  });

  it('uses PowerShell on Windows and xclip for images on Linux', async () => {
    const windows = setup('win32');
    await windows.clipboard.copy('screenshot', 'C:\\shot.png');
    await windows.clipboard.copy('recording', 'C:\\clip.mp4');
    expect(windows.runner.calls.map((call) => [call.executable, call.args.at(-1)])).toEqual([
      ['powershell', 'C:\\shot.png'],
      ['powershell', 'C:\\clip.mp4'],
    ]);
    const linux = setup('linux');
    await linux.clipboard.copy('screenshot', '/c/shot.png');
    expect(linux.runner.calls[0]).toEqual({ executable: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png', '-i', '/c/shot.png'] });
  });

  it('copies the path as text when there is no native command', async () => {
    const linux = setup('linux');
    expect(await linux.clipboard.copy('recording', '/c/clip.mp4')).toBe('path-copied');
    expect(linux.copyText).toHaveBeenCalledWith('/c/clip.mp4');
    const other = setup('aix');
    expect(await other.clipboard.copy('screenshot', '/c/shot.png')).toBe('path-copied');
  });

  it('falls back to the path when the native command fails', async () => {
    const { clipboard, runner, copyText } = setup('linux');
    runner.failure = new Error('xclip: not found');
    expect(await clipboard.copy('screenshot', '/c/shot.png')).toBe('path-copied');
    expect(copyText).toHaveBeenCalledWith('/c/shot.png');
  });

  it('defines commands for the supported platforms', () => {
    expect(Object.keys(CLIPBOARD_COMMANDS).sort()).toEqual(['darwin', 'linux', 'win32']);
  });
});
