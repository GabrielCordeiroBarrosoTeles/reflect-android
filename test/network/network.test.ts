import { describe, expect, it, vi } from 'vitest';
import { toCurl } from '../../src/network/curl';
import { NetworkReader } from '../../src/network/NetworkReader';
import { buildReadNetworkScript, CLEAR_NETWORK_SCRIPT, INSTALL_NETWORK_SCRIPT, MAX_BODY, MAX_ENTRIES, parseNetworkRead, parseResponseHeaders } from '../../src/network/networkScripts';
import type { NetworkEntry } from '../../src/network/types';
import { deviceInfo } from '../fakes/devices';
import { createXhrSandbox } from '../fakes/xhrSandbox';

const read = (sandbox: ReturnType<typeof createXhrSandbox>, since = 0) => parseNetworkRead(sandbox.run(buildReadNetworkScript(since)));
const entries = (sandbox: ReturnType<typeof createXhrSandbox>, since = 0): readonly NetworkEntry[] => {
  const result = read(sandbox, since);
  return result.status === 'ok' ? result.entries : [];
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('network capture script', () => {
  it('installs once and records requests with headers and bodies', () => {
    const sandbox = createXhrSandbox();
    expect(read(sandbox)).toEqual({ status: 'not-installed' });
    expect([sandbox.run(INSTALL_NETWORK_SCRIPT), sandbox.run(INSTALL_NETWORK_SCRIPT)]).toEqual(['installed', 'installed']);
    const xhr = sandbox.request('post', 'https://api.example.com/trips', '{"a":1}', { Authorization: 'Bearer x' });
    expect(entries(sandbox)).toMatchObject([{ id: 1, method: 'POST', state: 'pending', requestHeaders: { Authorization: 'Bearer x' }, requestBody: { text: '{"a":1}', truncated: false } }]);
    xhr.respond({ status: 201, text: '{"ok":true}' });
    expect(entries(sandbox)[0]).toMatchObject({ state: 'done', status: 201, responseHeaders: { 'content-type': 'application/json', 'x-id': '1' }, responseBody: { text: '{"ok":true}', truncated: false }, responseSize: 11 });
    expect(entries(sandbox)[0]?.duration).toBeGreaterThanOrEqual(0);
  });

  it('only returns entries changed since a revision', () => {
    const sandbox = createXhrSandbox();
    sandbox.run(INSTALL_NETWORK_SCRIPT);
    const first = sandbox.request('GET', 'https://a/1');
    sandbox.request('GET', 'https://a/2');
    const result = read(sandbox);
    const revision = result.status === 'ok' ? result.revision : 0;
    expect(entries(sandbox, revision)).toEqual([]);
    first.respond({ text: 'x' });
    expect(entries(sandbox, revision).map((entry) => entry.id)).toEqual([1]);
    expect(entries(sandbox, -5)).toHaveLength(2);
  });

  it('records failures, JSON, binary, images and blobs read in the app', async () => {
    const sandbox = createXhrSandbox();
    sandbox.run(INSTALL_NETWORK_SCRIPT);
    sandbox.request('GET', 'https://a/error').respond({ outcome: 'error' });
    sandbox.request('GET', 'https://a/timeout').respond({ outcome: 'timeout', withoutHeaders: true });
    sandbox.request('GET', 'https://a/abort').respond({ outcome: 'abort' });
    sandbox.request('GET', 'https://a/json').respond({ responseType: 'json', response: { a: 1 } });
    sandbox.request('GET', 'https://a/bin').respond({ responseType: 'arraybuffer', response: {} });
    sandbox.request('GET', 'https://a/logo.png').respond({ headers: 'Content-Type: image/png', responseType: 'blob', response: sandbox.blob('PNG') });
    sandbox.request('GET', 'https://a/blob').respond({ responseType: 'blob', response: sandbox.blob('{"b":2}') });
    sandbox.request('POST', 'https://a/upload', { form: true }).respond({ responseType: 'text', text: 'ok' });
    sandbox.request('GET', 'https://a/nobody', null).respond({ responseType: 'blob', response: null });
    await settle();
    const byUrl = Object.fromEntries(entries(sandbox).map((entry) => [entry.url.slice(10), entry]));
    expect(Object.fromEntries(Object.entries(byUrl).map(([url, entry]) => [url, [entry.state, entry.status, entry.responseBody?.text]]))).toEqual({
      error: ['error', 0, undefined],
      timeout: ['timeout', 0, undefined],
      abort: ['abort', 0, undefined],
      json: ['done', 200, '{"a":1}'],
      bin: ['done', 200, '[binary]'],
      'logo.png': ['done', 200, '[image]'],
      blob: ['done', 200, '{"b":2}'],
      upload: ['done', 200, 'ok'],
      nobody: ['done', 200, '[binary]'],
    });
    expect([byUrl.upload?.requestBody.text, byUrl['logo.png']?.responseSize, byUrl.blob?.responseSize, byUrl.timeout?.responseHeaders]).toEqual(['[binary]', 3, 7, {}]);
  });

  it('truncates large bodies, keeps the newest entries and survives a missing or failing FileReader', async () => {
    const sandbox = createXhrSandbox({ failReader: true });
    sandbox.run(INSTALL_NETWORK_SCRIPT);
    const big = 'x'.repeat(MAX_BODY + 10);
    sandbox.request('POST', 'https://a/big', big).respond({ text: big });
    sandbox.request('GET', 'https://a/bigblob').respond({ responseType: 'blob', response: sandbox.blob(big) });
    await settle();
    const [plain, blob] = entries(sandbox);
    expect([plain?.requestBody.truncated, plain?.responseBody?.truncated, plain?.responseBody?.text.length, blob?.responseBody?.text]).toEqual([true, true, MAX_BODY, '[unreadable]']);
    for (let index = 0; index < MAX_ENTRIES + 5; index += 1) sandbox.request('GET', `https://a/${index}`);
    expect(entries(sandbox)).toHaveLength(MAX_ENTRIES);
    sandbox.run(CLEAR_NETWORK_SCRIPT);
    expect(entries(sandbox)).toEqual([]);
    const noReader = createXhrSandbox({ withoutFileReader: true });
    noReader.run(INSTALL_NETWORK_SCRIPT);
    noReader.request('GET', 'https://a/b').respond({ responseType: 'blob', response: noReader.blob('x') });
    expect(entries(noReader)[0]?.responseBody?.text).toBe('[binary]');
  });

  it('reports apps without XMLHttpRequest and clears safely before installing', () => {
    const sandbox = createXhrSandbox({ withoutXhr: true });
    expect([sandbox.run(INSTALL_NETWORK_SCRIPT), sandbox.run(CLEAR_NETWORK_SCRIPT)]).toEqual(['unavailable', 'cleared']);
  });
});

describe('parseNetworkRead', () => {
  it('validates the answer from the app', () => {
    const unexpected = { status: 'error', message: 'Unexpected answer from the app' };
    expect([parseNetworkRead(undefined), parseNetworkRead('{'), parseNetworkRead('3'), parseNetworkRead('{"status":"ok"}'), parseNetworkRead('{"status":"x","entries":[]}')]).toEqual([unexpected, unexpected, unexpected, unexpected, unexpected]);
    expect(
      parseNetworkRead(
        JSON.stringify({
          status: 'ok',
          entries: [null, { id: 1 }, { id: 2, url: 'u', method: 'GET', state: 'weird' }, { id: 3, url: 'u', method: 'GET', state: 'done', status: 'x', requestHeaders: { a: 'b', n: 1 }, responseHeaders: { c: 'd' }, requestBody: 5, responseBody: { text: 't' }, duration: Number.NaN }],
        }),
      ),
    ).toEqual({
      status: 'ok',
      revision: 0,
      entries: [{ id: 3, url: 'u', method: 'GET', state: 'done', status: 0, startedAt: 0, duration: undefined, requestHeaders: { a: 'b' }, requestBody: { text: '', truncated: false }, responseHeaders: { c: 'd' }, responseBody: { text: 't', truncated: false }, responseSize: undefined }],
    });
    expect([parseResponseHeaders('A: 1\nbad line\nB:2'), parseResponseHeaders(5)]).toEqual([{ a: '1', b: '2' }, {}]);
  });
});

describe('NetworkReader', () => {
  const device = deviceInfo({ serial: 'A' });
  const readerFor = (evaluate: (script: string) => unknown) => new NetworkReader({ connectionFor: () => Promise.resolve({ backend: { evaluate: (script: string) => Promise.resolve(evaluate(script)) } }) } as never);

  it('installs the capture on first read and reads everything after a reload', async () => {
    const sandbox = createXhrSandbox();
    const reader = readerFor(sandbox.run);
    expect(await reader.read(device, 40)).toEqual({ status: 'ok', revision: 0, entries: [] });
    sandbox.request('GET', 'https://a/x');
    expect(await reader.read(device, 0)).toMatchObject({ status: 'ok', revision: 1, entries: [{ url: 'https://a/x' }] });
    await reader.clear(device);
    expect(await reader.read(device, 0)).toMatchObject({ entries: [] });
  });

  it('reports when the capture cannot be installed', async () => {
    expect(await readerFor(createXhrSandbox({ withoutXhr: true }).run).read(device, 0)).toEqual({ status: 'unavailable' });
    const stubborn = readerFor((script) => (script === INSTALL_NETWORK_SCRIPT ? 'installed' : JSON.stringify({ status: 'not-installed' })));
    expect(await stubborn.read(device, 0)).toEqual({ status: 'unavailable' });
    const evaluate = vi.fn(() => '{');
    expect(await readerFor(evaluate).read(device, 0)).toEqual({ status: 'error', message: 'Unexpected answer from the app' });
  });
});

describe('toCurl', () => {
  it('builds a runnable command with escaped quotes', () => {
    expect(toCurl({ method: 'POST', url: "https://a/x?q='1'", requestHeaders: { 'Content-Type': 'application/json', 'Content-Length': '9' }, requestBody: { text: '{"n":"D\'Ávila"}', truncated: false } })).toBe(
      ["curl -X POST 'https://a/x?q='\\''1'\\'''", "-H 'Content-Type: application/json'", "--data-raw '{\"n\":\"D'\\''Ávila\"}'"].join(' \\\n  '),
    );
    expect(toCurl({ method: 'GET', url: 'https://a', requestHeaders: {}, requestBody: { text: '', truncated: false } })).toBe("curl -X GET 'https://a'");
  });
});
