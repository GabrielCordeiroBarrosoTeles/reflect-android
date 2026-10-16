import { describe, expect, it, vi } from 'vitest';
import { SessionStateMachine } from '../../src/scrcpy/SessionStateMachine';
import type { SessionStateKind } from '../../src/shared/protocol';

const STATES: readonly SessionStateKind[] = ['idle', 'connecting', 'streaming', 'disconnected', 'error', 'closed'];

const ALLOWED: Readonly<Record<SessionStateKind, readonly SessionStateKind[]>> = {
  idle: ['connecting', 'closed'],
  connecting: ['streaming', 'disconnected', 'error', 'closed'],
  streaming: ['disconnected', 'error', 'closed'],
  disconnected: ['connecting', 'closed'],
  error: ['connecting', 'closed'],
  closed: [],
};

const PATHS: Readonly<Record<SessionStateKind, readonly SessionStateKind[]>> = {
  idle: [],
  connecting: ['connecting'],
  streaming: ['connecting', 'streaming'],
  disconnected: ['connecting', 'disconnected'],
  error: ['connecting', 'error'],
  closed: ['closed'],
};

const machineIn = (state: SessionStateKind): SessionStateMachine => {
  const machine = new SessionStateMachine();
  for (const step of PATHS[state]) {
    machine.transitionTo(step);
  }
  return machine;
};

const cases = STATES.flatMap((from) => STATES.map((to) => [from, to, ALLOWED[from].includes(to)] as const));

describe('SessionStateMachine', () => {
  it('starts idle', () => {
    expect(new SessionStateMachine().state).toBe('idle');
  });

  it.each(cases)('%s → %s allowed=%s', (from, to, allowed) => {
    const machine = machineIn(from);
    const listener = vi.fn();
    machine.onDidChange(listener);
    expect(machine.canTransitionTo(to)).toBe(allowed);
    expect(machine.transitionTo(to)).toBe(allowed);
    expect(machine.state).toBe(allowed ? to : from);
    expect(listener).toHaveBeenCalledTimes(allowed ? 1 : 0);
  });

  it('includes the detail only when provided', () => {
    const machine = new SessionStateMachine();
    const changes: unknown[] = [];
    machine.onDidChange((change) => changes.push(change));
    machine.transitionTo('connecting');
    machine.transitionTo('error', 'boom');
    expect(changes).toEqual([{ state: 'connecting' }, { state: 'error', detail: 'boom' }]);
  });

  it('stops notifying after dispose', () => {
    const machine = new SessionStateMachine();
    const listener = vi.fn();
    machine.onDidChange(listener);
    machine.dispose();
    machine.transitionTo('connecting');
    expect(listener).not.toHaveBeenCalled();
  });
});
