import { describe, expect, it, vi } from 'vitest';
import { MetroUnavailableError, ReactNativeAppNotFoundError } from '../../src/core/errors';
import { ComponentInspector } from '../../src/inspector/ComponentInspector';
import { HIT_RESULT_GLOBAL, HOVER_RESULT_GLOBAL } from '../../src/inspector/hitTestScript';
import type { IMetroClient, MetroTarget, StackFrame } from '../../src/inspector/types';
import { deviceInfo } from '../fakes/devices';
import { FakeCdpSession } from '../fakes/FakeCdpSession';
import { flushPromises } from '../fakes/PushStream';

const target: MetroTarget = { id: '1', title: 'app (samsung SM-F741B)', deviceName: 'SM-F741B', webSocketDebuggerUrl: 'ws://metro/debug' };
const timing = { pollIntervalMs: 1, pollAttempts: 3, timeoutMs: 1000 };

class FakeMetro implements IMetroClient {
  readonly port = 8081;
  readonly origins = ['http://127.0.0.1:8081'];
  targets: MetroTarget[] = [target];
  listFailure: Error | undefined;
  symbolicateFailure: Error | undefined;
  symbolicated: StackFrame[] = [{ file: '/app/src/Demo.tsx', lineNumber: 58, column: 11, methodName: 'Demo' }];

  listTargets(): Promise<MetroTarget[]> {
    return this.listFailure ? Promise.reject(this.listFailure) : Promise.resolve(this.targets);
  }

  symbolicate(): Promise<StackFrame[]> {
    return this.symbolicateFailure ? Promise.reject(this.symbolicateFailure) : Promise.resolve(this.symbolicated);
  }
}

const HIT = JSON.stringify({ status: 'hit', elementId: 7, rendererID: 1, stacks: ['Error\n    at Demo (http://b:1:2)'] });

const HOVER = JSON.stringify({
  status: 'hit',
  name: 'Text',
  owners: [{ name: 'Demo', stack: 'Error\n    at Demo (http://b:1:2)' }],
  x: 0.1,
  y: 0.2,
  width: 0.3,
  height: 0.05,
});

const createSession = (hitResults: (string | undefined)[] = [HIT], hoverResult: string = HOVER) => {
  const session = new FakeCdpSession();
  session.handler = (method, params) => {
    const expression = String(params?.expression ?? '');
    if (method !== 'Runtime.evaluate') return {};
    if (expression.includes(`JSON.stringify(globalThis.${HIT_RESULT_GLOBAL})`)) {
      return { result: { value: hitResults.length > 1 ? hitResults.shift() : hitResults[0] } };
    }
    if (expression.includes(`JSON.stringify(globalThis.${HOVER_RESULT_GLOBAL})`)) {
      return { result: { value: hoverResult } };
    }
    if (expression.includes('inspectElement')) {
      queueMicrotask(() =>
        session.emitDevTools('inspectedElement', {
          responseID: Number(/requestID\\":(\d+)/.exec(expression)?.[1]),
          type: 'full-data',
          value: { displayName: 'Text', props: { data: { children: 'Copy' } }, owners: [{ displayName: 'Demo' }] },
        }),
      );
    }
    return { result: {} };
  };
  return session;
};

const setup = (session = createSession()) => {
  const metro = new FakeMetro();
  const connect = vi.fn((_url: string) => Promise.resolve(session));
  return { metro, connect, session, inspector: new ComponentInspector(metro, connect, timing) };
};

const device = deviceInfo({ model: 'SM F741B' });

describe('ComponentInspector', () => {
  it('highlights the component under the cursor over the same connection', async () => {
    const { inspector, connect } = setup();
    expect(await inspector.highlightAt(device, { x: 0.2, y: 0.3 })).toEqual({
      name: 'Text',
      owner: 'Demo',
      location: 'Demo.tsx:58',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.05,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await inspector.inspectAt(device, { x: 0.2, y: 0.3 });
    expect(connect).toHaveBeenCalledOnce();
  });

  it('omits the owner when it is the hovered component itself, and both when no user code owns it', async () => {
    const own = setup();
    own.metro.symbolicated = [{ file: '/app/src/Text.tsx', lineNumber: 2, column: 1, methodName: 'Text' }];
    expect(await own.inspector.highlightAt(device, { x: 0, y: 0 })).toMatchObject({ owner: undefined, location: 'Text.tsx:2' });
    const library = setup();
    library.metro.symbolicated = [{ file: '/app/node_modules/x.js', lineNumber: 1, column: 1, methodName: 'x' }];
    expect(await library.inspector.highlightAt(device, { x: 0, y: 0 })).toMatchObject({ owner: undefined, location: undefined });
  });

  it('forgets resolved owners when disconnecting', async () => {
    const { inspector, metro } = setup();
    const symbolicate = vi.spyOn(metro, 'symbolicate');
    await inspector.highlightAt(device, { x: 0, y: 0 });
    await inspector.highlightAt(device, { x: 0, y: 0 });
    expect(symbolicate).toHaveBeenCalledOnce();
    inspector.disconnect();
    await inspector.highlightAt(device, { x: 0, y: 0 });
    expect(symbolicate).toHaveBeenCalledTimes(2);
  });

  it('returns nothing when no component is under the cursor', async () => {
    const { inspector } = setup(createSession([HIT], JSON.stringify({ status: 'miss' })));
    expect(await inspector.highlightAt(device, { x: 0, y: 0 })).toBeUndefined();
  });

  it('connects to the app, hit-tests the point and resolves the user source', async () => {
    const { inspector, connect, session } = setup();
    const component = await inspector.inspectAt(device, { x: 0.5, y: 0.3 });
    expect(connect).toHaveBeenCalledWith('ws://metro/debug');
    expect(session.calls.some((call) => String(call.params?.expression).includes('findNodeAtPoint'))).toBe(true);
    expect(component).toEqual({
      name: 'Text',
      props: [{ name: 'children', value: '"Copy"' }],
      owners: ['Demo'],
      source: { file: '/app/src/Demo.tsx', line: 58, column: 11 },
    });
  });

  it('reuses the connection for the same device', async () => {
    const { inspector, connect } = setup();
    await inspector.inspectAt(device, { x: 0, y: 0 });
    await inspector.inspectAt(device, { x: 1, y: 1 });
    expect(connect).toHaveBeenCalledOnce();
  });

  it('reconnects for another device or after the connection closes', async () => {
    const { inspector, connect, session, metro } = setup();
    await inspector.inspectAt(device, { x: 0, y: 0 });
    metro.targets = [{ ...target, deviceName: 'Pixel 8' }];
    await inspector.inspectAt(deviceInfo({ serial: 'B', model: 'Pixel 8' }), { x: 0, y: 0 });
    expect(session.disposed).toBe(1);
    session.closes.fire();
    await flushPromises();
    await inspector.inspectAt(deviceInfo({ serial: 'B', model: 'Pixel 8' }), { x: 0, y: 0 });
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('ignores close events from an older connection', async () => {
    const first = createSession();
    const second = createSession();
    const metro = new FakeMetro();
    const connect = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const inspector = new ComponentInspector(metro, connect, timing);
    await inspector.inspectAt(device, { x: 0, y: 0 });
    await inspector.inspectAt(deviceInfo({ serial: 'other', model: 'SM F741B' }), { x: 0, y: 0 });
    first.closes.fire();
    await flushPromises();
    await inspector.inspectAt(deviceInfo({ serial: 'other', model: 'SM F741B' }), { x: 0, y: 0 });
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('polls until the hit test finishes and gives up after the limit', async () => {
    const pending = JSON.stringify({ status: 'pending' });
    const eventually = setup(createSession([pending, pending, HIT]));
    expect(await eventually.inspector.inspectAt(device, { x: 0, y: 0 })).toBeDefined();
    const never = setup(createSession([pending]));
    expect(await never.inspector.inspectAt(device, { x: 0, y: 0 })).toBeUndefined();
  });

  it('returns undefined when nothing is at the point', async () => {
    const { inspector } = setup(createSession([JSON.stringify({ status: 'miss' })]));
    expect(await inspector.inspectAt(device, { x: 0, y: 0 })).toBeUndefined();
  });

  it('keeps the component without source when there are no frames or symbolication fails', async () => {
    const noStacks = setup(createSession([JSON.stringify({ status: 'hit', elementId: 7, rendererID: 1, stacks: [] })]));
    expect((await noStacks.inspector.inspectAt(device, { x: 0, y: 0 }))?.source).toBeUndefined();
    const failing = setup();
    failing.metro.symbolicateFailure = new Error('metro restarted');
    expect((await failing.inspector.inspectAt(device, { x: 0, y: 0 }))?.source).toBeUndefined();
  });

  it('explains when Metro is not running', async () => {
    const { inspector, metro } = setup();
    metro.listFailure = new Error('ECONNREFUSED');
    const error = await inspector.inspectAt(device, { x: 0, y: 0 }).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MetroUnavailableError);
    expect((error as MetroUnavailableError).port).toBe(8081);
  });

  it('explains when the device has no debuggable app and retries next time', async () => {
    const { inspector, metro, connect } = setup();
    metro.targets = [];
    await expect(inspector.inspectAt(device, { x: 0, y: 0 })).rejects.toBeInstanceOf(ReactNativeAppNotFoundError);
    metro.targets = [target];
    await inspector.inspectAt(device, { x: 0, y: 0 });
    expect(connect).toHaveBeenCalledOnce();
  });

  it('closes the session when DevTools cannot be initialized', async () => {
    const session = new FakeCdpSession();
    session.handler = (method) => {
      if (method === 'Runtime.addBinding') throw new Error('binding refused');
      return {};
    };
    const { inspector } = setup(session);
    await expect(inspector.inspectAt(device, { x: 0, y: 0 })).rejects.toThrow('binding refused');
    expect(session.disposed).toBe(1);
  });

  it('tolerates a connection that fails after being cancelled', async () => {
    const { inspector, metro } = setup();
    let fail!: (error: Error) => void;
    metro.listTargets = () => new Promise((_resolve, reject) => (fail = reject));
    const pending = inspector.inspectAt(device, { x: 0, y: 0 });
    await flushPromises();
    inspector.disconnect();
    fail(new Error('ECONNREFUSED'));
    await expect(pending).rejects.toBeInstanceOf(MetroUnavailableError);
  });

  it('retries when a concurrent connection attempt fails', async () => {
    const { inspector, metro } = setup();
    const original = metro.listTargets.bind(metro);
    let fail!: (error: Error) => void;
    metro.listTargets = () => new Promise((_resolve, reject) => (fail = reject));
    const first = inspector.inspectAt(device, { x: 0, y: 0 });
    await flushPromises();
    const second = inspector.inspectAt(device, { x: 0, y: 0 });
    metro.listTargets = original;
    fail(new Error('ECONNREFUSED'));
    await expect(first).rejects.toBeInstanceOf(MetroUnavailableError);
    await expect(second).resolves.toMatchObject({ name: 'Text' });
  });

  it('disconnects on demand and on dispose', async () => {
    const { inspector, session } = setup();
    inspector.disconnect();
    await inspector.inspectAt(device, { x: 0, y: 0 });
    inspector.dispose();
    await flushPromises();
    expect(session.disposed).toBe(1);
  });
});
