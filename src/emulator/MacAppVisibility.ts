import type { ProcessRunner } from '../adb/types';
import type { IAppVisibility } from './types';

export const APP_VISIBILITY_SCRIPT = [
  'ObjC.import("AppKit");',
  'function run(argv) {',
  '  const app = $.NSRunningApplication.runningApplicationWithProcessIdentifier(Number(argv[1]));',
  '  if (app.isNil()) { throw new Error("No app with pid " + argv[1]); }',
  '  return argv[0] === "hide" ? app.hide : app.unhide;',
  '}',
].join('\n');

export class MacAppVisibility implements IAppVisibility {
  constructor(private readonly runner: ProcessRunner) {}

  hide(pid: number): Promise<void> {
    return this.apply('hide', pid);
  }

  unhide(pid: number): Promise<void> {
    return this.apply('unhide', pid);
  }

  private apply(action: 'hide' | 'unhide', pid: number): Promise<void> {
    return this.runner.run('osascript', ['-l', 'JavaScript', '-e', APP_VISIBILITY_SCRIPT, action, String(pid)]);
  }
}
