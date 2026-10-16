import { afterEach, describe, expect, it, vi } from 'vitest';
import { CdpSession } from '../../src/inspector/CdpSession';
import { FakeSocket } from '../fakes/FakeSocket';
import { flushPromises } from '../fakes/PushStream';

afterEach(() => {
  vi.useRealTimers();
});

const openSession = () => {
  const socket = new FakeSocket();
  const session = new CdpSession(socket, 1000);
  socket.opens.fire();
  return { socket, session };
};

describe('CdpSession', () => {
  it('matches responses to requests by id', async () => {
    const { socket, session } = openSession();
    socket.respond = (request) => ({ id: request.id, result: { echo: request.method } });
    expect(await session.send('Runtime.enable')).toEqual({ echo: 'Runtime.enable' });
    expect(socket.sent[0]).toEqual({ id: 1, method: 'Runtime.enable', params: {} });
  });

  it('rejects CDP errors with and without a message', async () => {
    const { socket, session } = openSession();
    socket.respond = (request) => ({ id: request.id, error: request.method === 'a' ? { message: 'bad' } : {} });
    await expect(session.send('a')).rejects.toThrow('bad');
    await expect(session.send('b')).rejects.toThrow('CDP error');
  });

  it('emits events and ignores malformed or unknown messages', () => {
    const { socket, session } = openSession();
    const events = vi.fn();
    session.onEvent(events);
    socket.messages.fire('not json');
    socket.messages.fire(JSON.stringify({ id: 99, result: {} }));
    socket.messages.fire(JSON.stringify({}));
    socket.messages.fire(JSON.stringify({ method: 'Runtime.bindingCalled', params: { name: 'x' } }));
    expect(events).toHaveBeenCalledExactlyOnceWith({ method: 'Runtime.bindingCalled', params: { name: 'x' } });
  });

  it('times out unanswered requests', async () => {
    vi.useFakeTimers();
    const { session } = openSession();
    const request = session.send('slow');
    vi.advanceTimersByTime(1000);
    await expect(request).rejects.toThrow('slow timed out');
  });

  it('fails pending and future requests once closed', async () => {
    const { socket, session } = openSession();
    const closed = vi.fn();
    session.onDidClose(closed);
    const pending = session.send('a');
    socket.closes.fire();
    await expect(pending).rejects.toThrow('Debugger connection closed');
    await expect(session.send('b')).rejects.toThrow('Debugger connection closed');
    session.dispose();
    expect(closed).toHaveBeenCalledOnce();
    expect(socket.closed).toBe(0);
  });

  it('closes the socket on dispose', () => {
    const { socket, session } = openSession();
    session.dispose();
    expect(socket.closed).toBe(1);
  });

  describe('connect', () => {
    it('uses the first origin that keeps the connection alive', async () => {
      const sockets: FakeSocket[] = [];
      const factory = (_url: string, origin: string) => {
        const socket = new FakeSocket(origin);
        sockets.push(socket);
        queueMicrotask(() => {
          socket.opens.fire();
          if (origin === 'http://localhost:8081') {
            socket.respond = (request) => ({ id: request.id, result: {} });
          } else {
            socket.respond = () => {
              queueMicrotask(() => socket.closes.fire());
              return undefined;
            };
          }
        });
        return socket;
      };
      const session = await CdpSession.connect('ws://x', ['http://127.0.0.1:8081', 'http://localhost:8081'], factory, 1000);
      expect(sockets.map((socket) => socket.origin)).toEqual(['http://127.0.0.1:8081', 'http://localhost:8081']);
      expect(session).toBeInstanceOf(CdpSession);
    });

    it('fails with the last error when no origin works', async () => {
      const factory = () => {
        const socket = new FakeSocket();
        queueMicrotask(() => socket.closes.fire());
        return socket;
      };
      await expect(CdpSession.connect('ws://x', ['a'], factory, 1000)).rejects.toThrow('Debugger connection closed');
      await expect(CdpSession.connect('ws://x', [], factory, 1000)).rejects.toThrow('No origin to try');
      await flushPromises();
    });
  });
});
