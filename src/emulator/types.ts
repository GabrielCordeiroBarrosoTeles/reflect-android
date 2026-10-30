export type EmulatorExecFile = (
  file: string,
  args: string[],
  options: { readonly timeout: number },
  callback: (error: Error | null, stdout: string) => void,
) => unknown;

export interface IEmulatorConsole {
  run(serial: string, args: readonly string[]): Promise<string>;
}

export interface IAppVisibility {
  hide(pid: number): Promise<void>;
  unhide(pid: number): Promise<void>;
}
