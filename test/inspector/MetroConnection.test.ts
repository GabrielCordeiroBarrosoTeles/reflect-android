import { describe, expect, it, vi } from 'vitest';
import { MetroConnection } from '../../src/inspector/MetroConnection';
import type { IMetroClient } from '../../src/inspector/types';
import { deviceInfo } from '../fakes/devices';
import { FakeCdpSession } from '../fakes/FakeCdpSession';
import { flushPromises } from '../fakes/PushStream';

const metro: IMetroClient = {
  port: 8081,
  origins: [],
  listTargets: () => Promise.resolve([{ id: '1', title: 'app', deviceName: 'SM-F741B', webSocketDebuggerUrl: 'ws://x' }]),
  symbolicate: () => Promise.resolve([]),
};

describe('MetroConnection', () => {
  it('shares one connection per device between features and closes it on dispose', async () => {
    const session = new FakeCdpSession();
    const connect = vi.fn(() => Promise.resolve(session));
    const connections = new MetroConnection(metro, connect, 1000);
    const device = deviceInfo({ model: 'SM F741B' });
    const [first, second] = await Promise.all([connections.connectionFor(device), connections.connectionFor(device)]);
    expect(first.session).toBe(second.session);
    expect(connect).toHaveBeenCalledOnce();
    connections.dispose();
    await flushPromises();
    expect(session.disposed).toBe(1);
  });

  it('keeps the newer connection when an older one fails late', async () => {
    let fail: (error: Error) => void = () => undefined;
    const late = { ...metro, listTargets: vi.fn().mockReturnValueOnce(new Promise((_resolve, reject) => (fail = reject))).mockImplementation(metro.listTargets) };
    const connect = vi.fn(() => Promise.resolve(new FakeCdpSession()));
    const connections = new MetroConnection(late, connect, 1000);
    const older = connections.connectionFor(deviceInfo({ serial: 'A', model: 'SM F741B' }));
    const newer = await connections.connectionFor(deviceInfo({ serial: 'B', model: 'SM F741B' }));
    fail(new Error('slow'));
    await older.catch(() => undefined);
    await flushPromises();
    expect(await connections.connectionFor(deviceInfo({ serial: 'B', model: 'SM F741B' }))).toBe(newer);
  });
});
