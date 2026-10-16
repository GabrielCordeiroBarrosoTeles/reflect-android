import { describe, expect, it, vi } from 'vitest';
import { FetchHttpClient } from '../../src/inspector/FetchHttpClient';

const response = (ok: boolean, body: unknown, status = 200) => ({ ok, status, json: () => Promise.resolve(body) }) as Response;

describe('FetchHttpClient', () => {
  it('gets JSON with a timeout signal', async () => {
    const fetchFunction = vi.fn(() => Promise.resolve(response(true, [1])));
    expect(await new FetchHttpClient(fetchFunction, 100).getJson('http://x/list')).toEqual([1]);
    expect(fetchFunction).toHaveBeenCalledWith('http://x/list', expect.objectContaining({ method: 'GET', signal: expect.any(AbortSignal) }));
  });

  it('posts JSON bodies', async () => {
    const fetchFunction = vi.fn(() => Promise.resolve(response(true, { ok: 1 })));
    await new FetchHttpClient(fetchFunction, 100).postJson('http://x/s', { a: 1 });
    expect(fetchFunction).toHaveBeenCalledWith(
      'http://x/s',
      expect.objectContaining({ method: 'POST', body: '{"a":1}', headers: { 'content-type': 'application/json' } }),
    );
  });

  it('rejects non-success responses', async () => {
    const fetchFunction = vi.fn(() => Promise.resolve(response(false, null, 503)));
    await expect(new FetchHttpClient(fetchFunction, 100).getJson('http://x')).rejects.toThrow('HTTP 503 for http://x');
  });
});
