import WebSocket from 'ws';
import { Emitter } from '../core/Emitter';
import type { ISocket } from './types';

export class WsSocket implements ISocket {
  private readonly openEmitter = new Emitter<void>();
  private readonly messageEmitter = new Emitter<string>();
  private readonly closeEmitter = new Emitter<void>();
  private readonly socket: WebSocket;

  readonly onOpen = this.openEmitter.event;
  readonly onMessage = this.messageEmitter.event;
  readonly onClose = this.closeEmitter.event;

  constructor(url: string, origin: string) {
    this.socket = new WebSocket(url, { origin, perMessageDeflate: false });
    this.socket.on('open', () => this.openEmitter.fire());
    this.socket.on('message', (data: WebSocket.RawData) => this.messageEmitter.fire(data.toString()));
    this.socket.on('error', () => this.socket.terminate());
    this.socket.on('close', () => this.closeEmitter.fire());
  }

  send(data: string): void {
    this.socket.send(data);
  }

  close(): void {
    this.socket.close();
  }
}
