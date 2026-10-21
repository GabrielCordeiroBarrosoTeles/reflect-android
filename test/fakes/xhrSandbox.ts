import { createContext, runInContext } from 'node:vm';

type Listener = () => void;

export interface FakeResponse {
  readonly status?: number;
  readonly headers?: string;
  readonly responseType?: string;
  readonly text?: string;
  readonly response?: unknown;
  readonly outcome?: 'load' | 'error' | 'timeout' | 'abort';
  readonly withoutHeaders?: boolean;
}

export const createXhrSandbox = (options: { readonly withoutXhr?: boolean; readonly withoutFileReader?: boolean; readonly failReader?: boolean } = {}) => {
  const sent: FakeXhr[] = [];

  class FakeXhr {
    status = 0;
    responseType = '';
    responseText = '';
    response: unknown;
    private readonly listeners = new Map<string, Listener[]>();
    private headers = '';
    getAllResponseHeaders?: () => string = () => this.headers;

    open(_method: string, _url: string): void {}

    setRequestHeader(_name: string, _value: string): void {}

    send(_body?: unknown): void {
      sent.push(this);
    }

    addEventListener(type: string, listener: Listener): void {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }

    respond({ status = 200, headers = 'Content-Type: application/json\r\nX-Id: 1', responseType = '', text = '', response, outcome = 'load', withoutHeaders }: FakeResponse): void {
      this.status = outcome === 'load' ? status : 0;
      this.headers = headers;
      this.responseType = responseType;
      this.responseText = text;
      this.response = response;
      if (withoutHeaders) {
        this.getAllResponseHeaders = undefined;
      }
      (this.listeners.get(outcome) ?? []).forEach((listener) => listener());
    }
  }

  class FakeFileReader {
    result: unknown;
    onload: Listener = () => undefined;
    onerror: Listener = () => undefined;

    readAsText(blob: { text: string }): void {
      if (options.failReader) {
        queueMicrotask(() => this.onerror());
        return;
      }
      this.result = blob.text;
      queueMicrotask(() => this.onload());
    }
  }

  const context = createContext({
    ...(options.withoutXhr ? {} : { XMLHttpRequest: FakeXhr }),
    ...(options.withoutFileReader ? {} : { FileReader: FakeFileReader }),
    JSON,
    Date,
  });
  const run = (script: string): unknown => runInContext(script, context);
  const request = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}): FakeXhr => {
    const xhr = new (runInContext('XMLHttpRequest', context) as typeof FakeXhr)();
    xhr.open(method, url);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.send(body);
    return xhr;
  };
  return { context, run, request, sent, blob: (text: string) => ({ text, size: text.length, slice: (start: number, end: number) => ({ text: text.slice(start, end), size: end - start }) }) };
};
