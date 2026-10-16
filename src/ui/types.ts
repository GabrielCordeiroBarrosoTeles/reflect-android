export interface StatusBarView {
  readonly text: string;
  readonly tooltip: string;
}

export interface ErrorAction {
  readonly title: string;
  run(): Promise<unknown>;
}
