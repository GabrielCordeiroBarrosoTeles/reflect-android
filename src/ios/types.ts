export interface ISimctl {
  run(args: readonly string[], input?: string): Promise<string>;
}

export interface ChildInput {
  end(data: string): void;
}

export type SimctlExecFile = (
  file: string,
  args: string[],
  options: { readonly timeout: number },
  callback: (error: Error | null, stdout: string) => void,
) => { readonly stdin: ChildInput | null };
