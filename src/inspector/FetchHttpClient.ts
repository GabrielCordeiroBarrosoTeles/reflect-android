import type { IHttpClient } from './types';

type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export class FetchHttpClient implements IHttpClient {
  constructor(
    private readonly fetchFunction: FetchFunction,
    private readonly timeoutMs: number,
  ) {}

  async getJson(url: string): Promise<unknown> {
    return this.request(url, { method: 'GET' });
  }

  async postJson(url: string, body: unknown): Promise<unknown> {
    return this.request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const response = await this.fetchFunction(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return response.json();
  }
}
