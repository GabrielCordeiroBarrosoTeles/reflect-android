import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildHitTestScript, HIT_RESULT_GLOBAL, parseHitResult, READ_HIT_RESULT_SCRIPT } from '../../src/inspector/hitTestScript';

interface FakeFiber {
  type?: string;
  child?: FakeFiber;
  stateNode?: { node?: unknown; canonical?: { publicInstance?: unknown } };
  _debugOwner?: FakeFiber;
  _debugStack?: { stack: string };
}

const createRuntime = (options: { hitFiber?: FakeFiber | null; rootless?: boolean; ids?: Map<unknown, number>; noFabric?: boolean; throwing?: boolean } = {}) => {
  const rootNode = { tag: 'root' };
  const hostFiber: FakeFiber = { stateNode: { node: rootNode } };
  const root = { current: options.rootless ? { child: undefined } : { child: hostFiber } };
  const ids = options.ids ?? new Map();
  const calls: { x: number; y: number }[] = [];
  const context: Record<string, unknown> = {
    String,
    __REACT_DEVTOOLS_GLOBAL_HOOK__: {
      renderers: new Map([[1, {}]]),
      getFiberRoots: () => new Set([root]),
      rendererInterfaces: new Map([
        [
          1,
          {
            getElementIDForHostInstance: (candidate: unknown) => {
              if (options.throwing) throw new Error('unsupported instance');
              return ids.get(candidate) ?? null;
            },
          },
        ],
      ]),
    },
    nativeFabricUIManager: options.noFabric
      ? undefined
      : {
          measure: (_node: unknown, callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 0, 400, 800),
          findNodeAtPoint: (_node: unknown, x: number, y: number, callback: (fiber: FakeFiber | null) => void) => {
            calls.push({ x, y });
            callback(options.hitFiber ?? null);
          },
        },
  };
  context.globalThis = context;
  return { context, calls, read: () => runInNewContext(READ_HIT_RESULT_SCRIPT, context) as string };
};

describe('buildHitTestScript', () => {
  it('finds the element at the point and collects owner stacks', () => {
    const publicInstance = { tag: 'public' };
    const owner: FakeFiber = { _debugStack: { stack: 'Error\n    at Demo (http://b:1:2)' } };
    const hit: FakeFiber = { stateNode: { canonical: { publicInstance } }, _debugOwner: owner, _debugStack: { stack: 'Error\n    at Text (http://b:3:4)' } };
    const runtime = createRuntime({ hitFiber: hit, ids: new Map([[publicInstance, 42]]) });
    runInNewContext(buildHitTestScript({ x: 0.25, y: 0.5 }), runtime.context);
    expect(runtime.calls).toEqual([{ x: 100, y: 400 }]);
    expect(parseHitResult(runtime.read())).toEqual({
      status: 'hit',
      elementId: 42,
      rendererID: 1,
      stacks: ['Error\n    at Text (http://b:3:4)', 'Error\n    at Demo (http://b:1:2)'],
    });
  });

  it('identifies elements by their state node', () => {
    const stateNode = {};
    const runtime = createRuntime({ hitFiber: { stateNode }, ids: new Map([[stateNode, 9]]) });
    runInNewContext(buildHitTestScript({ x: 0, y: 0 }), runtime.context);
    expect(parseHitResult(runtime.read())).toMatchObject({ status: 'hit', elementId: 9, stacks: [] });
  });

  it.each([
    ['nothing is at the point', { hitFiber: null }, 'miss'],
    ['the element is unknown to DevTools', { hitFiber: {} }, 'miss'],
    ['DevTools throws for the instance', { hitFiber: { stateNode: {} }, throwing: true }, 'miss'],
    ['there is no rendered root', { rootless: true }, 'empty'],
    ['the app does not use Fabric', { noFabric: true }, 'unsupported'],
  ])('reports when %s', (_label, options, status) => {
    const runtime = createRuntime(options);
    runInNewContext(buildHitTestScript({ x: 0.5, y: 0.5 }), runtime.context);
    expect(parseHitResult(runtime.read())).toEqual({ status });
  });

  it('stores results on a dedicated global', () => {
    expect(READ_HIT_RESULT_SCRIPT).toBe(`JSON.stringify(globalThis.${HIT_RESULT_GLOBAL})`);
  });
});

describe('parseHitResult', () => {
  it.each([undefined, 'not json', 'null', '{"status":"pending"}', '{"status":"hit","elementId":"x","rendererID":1}', '{"status":"weird"}'])(
    'treats %j as pending',
    (raw) => {
      expect(parseHitResult(raw)).toEqual({ status: 'pending' });
    },
  );

  it('keeps only string stacks', () => {
    expect(parseHitResult('{"status":"hit","elementId":1,"rendererID":2,"stacks":["a",3]}')).toEqual({
      status: 'hit',
      elementId: 1,
      rendererID: 2,
      stacks: ['a'],
    });
    expect(parseHitResult('{"status":"hit","elementId":1,"rendererID":2}')).toMatchObject({ stacks: [] });
  });
});
