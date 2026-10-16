import { describe, expect, it, vi } from 'vitest';
import { MetroClient } from '../../src/inspector/MetroClient';

const setup = (getJson: unknown = [], postJson: unknown = {}) => {
  const http = { getJson: vi.fn(() => Promise.resolve(getJson)), postJson: vi.fn(() => Promise.resolve(postJson)) };
  return { http, client: new MetroClient(http, () => 19000) };
};

describe('MetroClient', () => {
  it('exposes the port and the origins accepted by Expo and React Native', () => {
    const { client } = setup();
    expect(client.port).toBe(19000);
    expect(client.origins).toEqual(['http://127.0.0.1:19000', 'http://localhost:19000']);
  });

  it('lists debuggable targets and skips invalid entries', async () => {
    const { client, http } = setup([
      { id: 'a', title: 'App (Pixel)', deviceName: 'Pixel', webSocketDebuggerUrl: 'ws://x/a' },
      { id: 'b', title: 7 },
      null,
      { webSocketDebuggerUrl: 'ws://x/c' },
    ]);
    expect(await client.listTargets()).toEqual([
      { id: 'a', title: 'App (Pixel)', deviceName: 'Pixel', webSocketDebuggerUrl: 'ws://x/a' },
      { id: '', title: '', deviceName: '', webSocketDebuggerUrl: 'ws://x/c' },
    ]);
    expect(http.getJson).toHaveBeenCalledWith('http://localhost:19000/json/list');
  });

  it('returns no targets for unexpected responses', async () => {
    expect(await setup({}).client.listTargets()).toEqual([]);
  });

  it('symbolicates frames', async () => {
    const frames = [{ file: 'http://bundle', lineNumber: 1, column: 2, methodName: 'f' }];
    const { client, http } = setup(
      [],
      { stack: [{ file: '/src/App.tsx', lineNumber: 10, column: 3, methodName: 'App' }, { file: '/x', lineNumber: 1 }, { nope: true }] },
    );
    expect(await client.symbolicate(frames)).toEqual([
      { file: '/src/App.tsx', lineNumber: 10, column: 3, methodName: 'App' },
      { file: '/x', lineNumber: 1, column: 0, methodName: '' },
    ]);
    expect(http.postJson).toHaveBeenCalledWith('http://localhost:19000/symbolicate', { stack: frames });
  });

  it('returns no frames for unexpected responses', async () => {
    expect(await setup([], null).client.symbolicate([])).toEqual([]);
  });
});
