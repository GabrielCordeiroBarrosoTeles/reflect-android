export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export interface LogLine {
  readonly id: number;
  readonly time: string;
  readonly pid: number;
  readonly tid: number;
  readonly level: LogLevel;
  readonly tag: string;
  readonly message: string;
}

export interface LogRead {
  readonly app: string | undefined;
  readonly pid: number | undefined;
  readonly lines: readonly Omit<LogLine, 'id'>[];
}

export interface ILogReader {
  read(serial: string, since: string | undefined): Promise<LogRead>;
}
