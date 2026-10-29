import { describe, expect, it, vi } from 'vitest';
import { AppReloader } from '../../src/inspector/AppReloader';
import type { IMetroClient, MetroTarget } from '../../src/inspector/types';
import { device } from '../fakes/devices';
import { FakeCdpSession } from '../fakes/FakeCdpSession';

const target: MetroTarget = { id: '1', title: 'app', deviceName: 'SM-F741B', webSocketDebuggerUrl: 'ws://x' };

const setup = (targets: MetroTarget[] | Error = [target]) => {
  const metro = {
    port: 8081,
    origins: [],
    listTargets: () => (targets instanceof Error ? Promise.reject(targets) : Promise.resolve(targets)),
    symbolicate: () => Promise.resolve([]),
  } satisfies IMetroClient;
  const session = new FakeCdpSession();
  const connect = vi.fn(() => Promise.resolve(session));
  return { session, connect, reloader: new AppReloader(metro, connect) };
};

const phone = device({ model: 'SM F741B' });

describe('AppReloader', () => {
  it('reloads the app through the debugger and closes the session', async () => {
    const { reloader, session, connect } = setup();
    expect(await reloader.reload(phone)).toBe(true);
    expect(connect).toHaveBeenCalledWith('ws://x');
    expect(session.calls).toEqual([{ method: 'Page.reload', params: undefined }]);
    expect(session.disposed).toBe(1);
  });

  it('returns false without a matching app', async () => {
    const { reloader, connect } = setup([]);
    expect(await reloader.reload(phone)).toBe(false);
    expect(connect).not.toHaveBeenCalled();
  });

  it('returns false when Metro or the reload fails', async () => {
    expect(await setup(new Error('ECONNREFUSED')).reloader.reload(phone)).toBe(false);
    const failing = setup();
    failing.session.handler = () => {
      throw new Error('not supported');
    };
    expect(await failing.reloader.reload(phone)).toBe(false);
    expect(failing.session.disposed).toBe(1);
  });
});
