import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { SessionStateKind } from '../shared/protocol';
import type { SessionStateChange } from '../platform/types';

const TRANSITIONS: Readonly<Record<SessionStateKind, readonly SessionStateKind[]>> = {
  idle: ['connecting', 'closed'],
  connecting: ['streaming', 'disconnected', 'error', 'closed'],
  streaming: ['disconnected', 'error', 'closed'],
  disconnected: ['connecting', 'closed'],
  error: ['connecting', 'closed'],
  closed: [],
};

export class SessionStateMachine implements IDisposable {
  private readonly changeEmitter = new Emitter<SessionStateChange>();
  private current: SessionStateKind = 'idle';

  readonly onDidChange = this.changeEmitter.event;

  get state(): SessionStateKind {
    return this.current;
  }

  canTransitionTo(next: SessionStateKind): boolean {
    return TRANSITIONS[this.current].includes(next);
  }

  transitionTo(next: SessionStateKind, detail?: string): boolean {
    if (!this.canTransitionTo(next)) {
      return false;
    }
    this.current = next;
    this.changeEmitter.fire(detail === undefined ? { state: next } : { state: next, detail });
    return true;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }
}
