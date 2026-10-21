import type { CapturedBody, NetworkEntry, NetworkResult, RequestState } from './types';

export const NETWORK_GLOBAL = '__reflectNetwork';
export const MAX_ENTRIES = 200;
export const MAX_BODY = 262_144;

export const INSTALL_NETWORK_SCRIPT = `(() => {
  const g = globalThis;
  if (g.${NETWORK_GLOBAL}) return 'installed';
  const XHR = g.XMLHttpRequest;
  if (!XHR || !XHR.prototype) return 'unavailable';
  const state = { revision: 0, nextId: 1, entries: [] };
  g.${NETWORK_GLOBAL} = state;
  const touch = (entry) => {
    state.revision += 1;
    entry.revision = state.revision;
  };
  const cut = (text) => (text.length > ${MAX_BODY} ? { text: text.slice(0, ${MAX_BODY}), truncated: true } : { text, truncated: false });
  const describe = (body) => (body == null ? '' : typeof body === 'string' ? body : '[binary]');
  const proto = XHR.prototype;
  const open = proto.open;
  const send = proto.send;
  const setRequestHeader = proto.setRequestHeader;
  proto.open = function (method, url) {
    this.__reflectRequest = { method: String(method).toUpperCase(), url: String(url), headers: {} };
    return open.apply(this, arguments);
  };
  proto.setRequestHeader = function (name, value) {
    if (this.__reflectRequest) this.__reflectRequest.headers[name] = String(value);
    return setRequestHeader.apply(this, arguments);
  };
  proto.send = function (body) {
    const request = this.__reflectRequest;
    if (request) {
      const xhr = this;
      const entry = { id: state.nextId, method: request.method, url: request.url, state: 'pending', status: 0, startedAt: Date.now(), requestHeaders: request.headers, requestBody: cut(describe(body)), responseHeaders: '' };
      state.nextId += 1;
      touch(entry);
      state.entries.push(entry);
      if (state.entries.length > ${MAX_ENTRIES}) state.entries.shift();
      const finish = (outcome) => {
        entry.state = outcome;
        entry.status = xhr.status || 0;
        entry.duration = Date.now() - entry.startedAt;
        entry.responseHeaders = typeof xhr.getAllResponseHeaders === 'function' ? xhr.getAllResponseHeaders() || '' : '';
        const type = xhr.responseType;
        const isImage = /content-type:\\s*image\\//i.test(entry.responseHeaders);
        if (outcome !== 'done') {
          touch(entry);
          return;
        }
        if (isImage) {
          entry.responseBody = { text: '[image]', truncated: false };
          entry.responseSize = xhr.response && xhr.response.size;
          touch(entry);
          return;
        }
        if (type === 'blob' && xhr.response && typeof g.FileReader === 'function') {
          const blob = xhr.response;
          entry.responseSize = blob.size;
          const reader = new g.FileReader();
          reader.onload = () => {
            entry.responseBody = { text: String(reader.result), truncated: blob.size > ${MAX_BODY} };
            touch(entry);
          };
          reader.onerror = () => {
            entry.responseBody = { text: '[unreadable]', truncated: false };
            touch(entry);
          };
          reader.readAsText(blob.size > ${MAX_BODY} ? blob.slice(0, ${MAX_BODY}) : blob);
          return;
        }
        const text = type === 'json' ? JSON.stringify(xhr.response) : type === '' || type === 'text' ? String(xhr.responseText) : '[binary]';
        entry.responseSize = text.length;
        entry.responseBody = cut(text);
        touch(entry);
      };
      xhr.addEventListener('load', () => finish('done'));
      xhr.addEventListener('error', () => finish('error'));
      xhr.addEventListener('timeout', () => finish('timeout'));
      xhr.addEventListener('abort', () => finish('abort'));
    }
    return send.apply(this, arguments);
  };
  return 'installed';
})()`;

export const buildReadNetworkScript = (since: number): string => `(() => {
  const state = globalThis.${NETWORK_GLOBAL};
  if (!state) return JSON.stringify({ status: 'not-installed' });
  return JSON.stringify({ status: 'ok', revision: state.revision, entries: state.entries.filter((entry) => entry.revision > ${Math.max(0, Math.floor(since))}) });
})()`;

export const CLEAR_NETWORK_SCRIPT = `(() => {
  const state = globalThis.${NETWORK_GLOBAL};
  if (state) state.entries = [];
  return 'cleared';
})()`;

export type ParsedRead = NetworkResult | { readonly status: 'not-installed' };

const STATES: ReadonlySet<string> = new Set<RequestState>(['pending', 'done', 'error', 'timeout', 'abort']);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const toBody = (value: unknown): CapturedBody | undefined =>
  isRecord(value) && typeof value.text === 'string' ? { text: value.text, truncated: value.truncated === true } : undefined;

const toNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

const toHeaders = (value: unknown): Record<string, string> =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};

export const parseResponseHeaders = (raw: unknown): Record<string, string> =>
  typeof raw === 'string'
    ? Object.fromEntries(
        raw
          .split(/\r?\n/)
          .map((line) => /^([^:]+):\s*(.*)$/.exec(line))
          .filter((match): match is RegExpExecArray => match !== null)
          .map((match) => [String(match[1]).trim().toLowerCase(), String(match[2]).trim()]),
      )
    : toHeaders(raw);

const toEntry = (value: unknown): NetworkEntry | undefined => {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.url !== 'string' || typeof value.method !== 'string' || !STATES.has(String(value.state))) {
    return undefined;
  }
  return {
    id: value.id,
    method: value.method,
    url: value.url,
    state: value.state as RequestState,
    status: toNumber(value.status) ?? 0,
    startedAt: toNumber(value.startedAt) ?? 0,
    duration: toNumber(value.duration),
    requestHeaders: toHeaders(value.requestHeaders),
    requestBody: toBody(value.requestBody) ?? { text: '', truncated: false },
    responseHeaders: parseResponseHeaders(value.responseHeaders),
    responseBody: toBody(value.responseBody),
    responseSize: toNumber(value.responseSize),
  };
};

const UNEXPECTED: ParsedRead = { status: 'error', message: 'Unexpected answer from the app' };

export const parseNetworkRead = (raw: unknown): ParsedRead => {
  let value: unknown;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : undefined;
  } catch {
    return UNEXPECTED;
  }
  if (!isRecord(value)) {
    return UNEXPECTED;
  }
  if (value.status === 'not-installed') {
    return { status: 'not-installed' };
  }
  if (value.status !== 'ok' || !Array.isArray(value.entries)) {
    return UNEXPECTED;
  }
  return {
    status: 'ok',
    revision: toNumber(value.revision) ?? 0,
    entries: value.entries.map(toEntry).filter((entry): entry is NetworkEntry => entry !== undefined),
  };
};
