import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVTOOLS_BINDING, ReactDevToolsBackend } from '../../src/inspector/ReactDevToolsBackend';
import { FakeCdpSession } from '../fakes/FakeCdpSession';

afterEach(() => {
  vi.useRealTimers();
});

const setup = () => {
  const session = new FakeCdpSession();
  return { session, backend: new ReactDevToolsBackend(session, 1000) };
};

describe('ReactDevToolsBackend', () => {
  it('opens the react-devtools domain through the Fusebox binding', async () => {
    const { session, backend } = setup();
    await backend.initialize();
    expect(session.calls.map((call) => call.method)).toEqual(['Runtime.enable', 'Runtime.addBinding', 'Runtime.evaluate']);
    expect(session.calls[1]?.params).toEqual({ name: DEVTOOLS_BINDING });
    expect(session.calls[2]?.params?.expression).toBe("void __FUSEBOX_REACT_DEVTOOLS_DISPATCHER__.initializeDomain('react-devtools')");
  });

  it('returns evaluated values and surfaces exceptions', async () => {
    const { session, backend } = setup();
    session.handler = (_method, params) => {
      if (params?.expression === 'ok') return { result: { value: 42 } };
      if (params?.expression === 'described') return { exceptionDetails: { exception: { description: 'TypeError: x' } } };
      if (params?.expression === 'texted') return { exceptionDetails: { text: 'Uncaught' } };
      return { exceptionDetails: {} };
    };
    expect(await backend.evaluate('ok')).toBe(42);
    await expect(backend.evaluate('described')).rejects.toThrow('TypeError: x');
    await expect(backend.evaluate('texted')).rejects.toThrow('Uncaught');
    await expect(backend.evaluate('bare')).rejects.toThrow('Evaluation failed');
  });

  it('emits devtools messages from the binding and ignores everything else', () => {
    const { session, backend } = setup();
    const messages = vi.fn();
    backend.onMessage(messages);
    session.emitDevTools('operations', [1, 2]);
    session.emitDevTools('operations', [1], 'other-domain');
    session.events.fire({ method: 'Runtime.bindingCalled', params: { name: DEVTOOLS_BINDING, payload: 'not json' } });
    session.events.fire({ method: 'Runtime.bindingCalled', params: { name: DEVTOOLS_BINDING, payload: 5 } });
    session.events.fire({ method: 'Runtime.bindingCalled', params: { name: 'other', payload: '{}' } });
    session.events.fire({ method: 'Runtime.bindingCalled', params: { name: DEVTOOLS_BINDING, payload: '{"domain":"react-devtools","message":{"event":1}}' } });
    session.events.fire({ method: 'Runtime.consoleAPICalled', params: {} });
    session.events.fire({ method: 'Runtime.bindingCalled', params: null });
    expect(messages).toHaveBeenCalledExactlyOnceWith({ event: 'operations', payload: [1, 2] });
  });

  it('inspects an element and waits for the matching response', async () => {
    const { session, backend } = setup();
    session.handler = (_method, params) => {
      const expression = String(params?.expression);
      if (expression.includes('inspectElement')) {
        queueMicrotask(() => {
          session.emitDevTools('inspectedElement', { responseID: 99, type: 'full-data' });
          session.emitDevTools('inspectedElement', { responseID: 1, type: 'full-data', value: { displayName: 'Button' } });
        });
      }
      return { result: {} };
    };
    const payload = await backend.inspectElement(7, 1);
    expect(payload).toEqual({ responseID: 1, type: 'full-data', value: { displayName: 'Button' } });
    const sent = String(session.calls.at(-1)?.params?.expression);
    expect(sent).toContain("__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__.sendMessage('react-devtools'");
    expect(JSON.parse(JSON.parse(sent.slice(sent.indexOf(', ') + 2, -1)) as string)).toEqual({
      event: 'inspectElement',
      payload: { id: 7, rendererID: 1, requestID: 1, forceFullData: true, path: null },
    });
  });

  it('gives up when DevTools never answers', async () => {
    vi.useFakeTimers();
    const { backend } = setup();
    const request = backend.inspectElement(1, 1);
    await flushPromisesWithFakeTimers();
    vi.advanceTimersByTime(1000);
    await expect(request).rejects.toThrow('React DevTools did not answer');
  });

  it('stops listening after dispose', () => {
    const { session, backend } = setup();
    const messages = vi.fn();
    backend.onMessage(messages);
    backend.dispose();
    session.emitDevTools('operations', []);
    expect(messages).not.toHaveBeenCalled();
  });
});

async function flushPromisesWithFakeTimers(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

