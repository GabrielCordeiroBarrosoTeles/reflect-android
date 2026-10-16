export interface ICommand {
  readonly id: string;
  execute(...args: readonly unknown[]): Promise<void>;
}
