import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const sockets = vi.hoisted(() => [] as { url: string; options: unknown; sent: string[]; closed: number; terminated: number; emit(event: string, ...args: unknown[]): boolean }[]);

vi.mock('ws', async () => {
  const { EventEmitter: Base } = await import('node:events');
  class FakeWebSocket extends Base {
    sent: string[] = [];
    closed = 0;
    terminated = 0;
    constructor(
      readonly url: string,
      readonly options: unknown,
    ) {
      super();
      sockets.push(this as never);
    }
    send(data: string) {
      this.sent.push(data);
    }
    close() {
      this.closed += 1;
    }
    terminate() {
      this.terminated += 1;
    }
  }
  return { default: FakeWebSocket };
});

const { WsSocket } = await import('../../src/inspector/WsSocket');

describe('WsSocket', () => {
  it('connects with the origin and without compression', () => {
    new WsSocket('ws://metro/debug', 'http://127.0.0.1:8081');
    expect(sockets.at(-1)).toMatchObject({ url: 'ws://metro/debug', options: { origin: 'http://127.0.0.1:8081', perMessageDeflate: false } });
  });

  it('forwards open, text messages and close, and sends data', () => {
    const socket = new WsSocket('ws://x', 'o');
    const raw = sockets.at(-1)!;
    const events: string[] = [];
    socket.onOpen(() => events.push('open'));
    socket.onMessage((data) => events.push(`message:${data}`));
    socket.onClose(() => events.push('close'));
    raw.emit('open');
    raw.emit('message', Buffer.from('{"id":1}'));
    raw.emit('close');
    socket.send('hello');
    socket.close();
    expect(events).toEqual(['open', 'message:{"id":1}', 'close']);
    expect(raw.sent).toEqual(['hello']);
    expect(raw.closed).toBe(1);
  });

  it('terminates the connection on errors', () => {
    new WsSocket('ws://x', 'o');
    const raw = sockets.at(-1)!;
    raw.emit('error', new Error('boom'));
    expect(raw.terminated).toBe(1);
    expect(raw).toBeInstanceOf(EventEmitter);
  });
});
