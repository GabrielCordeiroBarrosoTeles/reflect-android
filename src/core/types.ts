export interface IDisposable {
  dispose(): void;
}

export type Listener<T> = (value: T) => void;

export type Event<T> = (listener: Listener<T>) => IDisposable;

export interface ILogger {
  info(message: string): void;
  error(message: string, error?: unknown): void;
}
