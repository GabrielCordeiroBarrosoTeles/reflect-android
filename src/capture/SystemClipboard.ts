import type { ProcessRunner } from '../adb/types';
import type { CaptureKind } from './types';

interface ClipboardCommand {
  readonly executable: string;
  readonly args: (path: string) => readonly string[];
}

type PlatformCommands = Partial<Record<CaptureKind, ClipboardCommand>>;

const appleScript = (statement: string): ClipboardCommand => ({
  executable: 'osascript',
  args: (path) => ['-e', 'on run argv', '-e', statement, '-e', 'end run', path],
});

const powerShell = (script: string): ClipboardCommand => ({
  executable: 'powershell',
  args: (path) => ['-NoProfile', '-STA', '-Command', `& { param($file) ${script} }`, path],
});

export const CLIPBOARD_COMMANDS: Readonly<Partial<Record<NodeJS.Platform, PlatformCommands>>> = {
  darwin: {
    screenshot: appleScript('set the clipboard to (read (POSIX file (item 1 of argv)) as «class PNGf»)'),
    recording: appleScript('set the clipboard to (POSIX file (item 1 of argv))'),
  },
  win32: {
    screenshot: powerShell(
      'Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; [System.Windows.Forms.Clipboard]::SetImage([System.Drawing.Image]::FromFile($file))',
    ),
    recording: powerShell('Set-Clipboard -Path $file'),
  },
  linux: {
    screenshot: { executable: 'xclip', args: (path) => ['-selection', 'clipboard', '-t', 'image/png', '-i', path] },
  },
};

export type ClipboardResult = 'copied' | 'path-copied';

export class SystemClipboard {
  constructor(
    private readonly platform: NodeJS.Platform,
    private readonly runner: ProcessRunner,
    private readonly copyText: (text: string) => Promise<void>,
  ) {}

  async copy(kind: CaptureKind, path: string): Promise<ClipboardResult> {
    const command = CLIPBOARD_COMMANDS[this.platform]?.[kind];
    if (command) {
      try {
        await this.runner.run(command.executable, command.args(path));
        return 'copied';
      } catch {
        await this.copyText(path);
        return 'path-copied';
      }
    }
    await this.copyText(path);
    return 'path-copied';
  }
}
