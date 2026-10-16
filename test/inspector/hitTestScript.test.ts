import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  buildHitTestScript,
  buildHoverScript,
  HIT_RESULT_GLOBAL,
  parseHitResult,
  parseHoverResult,
  READ_HIT_RESULT_SCRIPT,
  READ_HOVER_RESULT_SCRIPT,
} from '../../src/inspector/hitTestScript';

interface FakeFiber {
  type?: string | { displayName?: string; name?: string };
  child?: FakeFiber;
  stateNode?: { node?: unknown; canonical?: { publicInstance?: unknown } };
  memoizedProps?: { style?: unknown };
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
          measure: (node: unknown, callback: (x: number, y: number, width: number, height: number, pageX: number, pageY: number) => void) =>
            node === rootNode ? callback(0, 0, 400, 800, 0, 0) : callback(10, 20, 200, 80, 100, 400),
          findNodeAtPoint: (_node: unknown, x: number, y: number, callback: (fiber: FakeFiber | null) => void) => {
            calls.push({ x, y });
            callback(options.hitFiber ?? null);
          },
        },
  };
  context.globalThis = context;
  return {
    context,
    calls,
    read: () => runInNewContext(READ_HIT_RESULT_SCRIPT, context) as string,
    readHover: () => runInNewContext(READ_HOVER_RESULT_SCRIPT, context) as string,
  };
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

describe('buildHoverScript', () => {
  const demo: FakeFiber = { type: { name: 'Demo' } };
  const styled: FakeFiber = { type: { displayName: 'Styled(Text)' }, _debugOwner: demo, _debugStack: { stack: 'Error\n    at Demo (http://b:5:6)' } };
  const text: FakeFiber = { type: { name: 'Text' }, _debugOwner: styled, _debugStack: { stack: 'Error\n    at Styled (http://b:3:4)' } };

  it('measures the node under the point relative to the root and lists its owners with stacks', () => {
    const runtime = createRuntime({
      hitFiber: {
        type: 'RCTText',
        stateNode: { node: {} },
        memoizedProps: { style: [{ padding: 8, margin: 4 }, null, [{ paddingHorizontal: 20, marginTop: 40, marginEnd: 80 }], { paddingLeft: 0 }] },
        _debugOwner: text,
        _debugStack: { stack: 'Error\n    at Text (http://b:1:2)' },
      },
    });
    runInNewContext(buildHoverScript({ x: 0.5, y: 0.5 }), runtime.context);
    expect(runtime.calls).toEqual([{ x: 200, y: 400 }]);
    expect(parseHoverResult(runtime.readHover())).toEqual({
      status: 'hit',
      name: 'Text',
      owners: [
        { name: 'Text', stack: 'Error\n    at Text (http://b:1:2)' },
        { name: 'Styled(Text)', stack: 'Error\n    at Styled (http://b:3:4)' },
        { name: 'Demo', stack: 'Error\n    at Demo (http://b:5:6)' },
      ],
      rect: {
        x: 0.25,
        y: 0.5,
        width: 0.5,
        height: 0.1,
        margin: { top: 0.05, right: 0.2, bottom: 0.005, left: 0.01 },
        padding: { top: 0.01, right: 0.05, bottom: 0.01, left: 0 },
      },
    });
  });

  it('skips owners without a name or a stack', () => {
    const runtime = createRuntime({ hitFiber: { stateNode: { node: {} }, _debugOwner: { type: { name: 'Card' }, _debugOwner: { type: 'RCTView' } } } });
    runInNewContext(buildHoverScript({ x: 0, y: 0 }), runtime.context);
    expect(parseHoverResult(runtime.readHover())).toMatchObject({ name: 'Card', owners: [], rect: { margin: { top: 0, right: 0, bottom: 0, left: 0 }, padding: { top: 0, right: 0, bottom: 0, left: 0 } } });
  });

  it.each([
    ['nothing is at the point', { hitFiber: null }],
    ['the node has no component owner', { hitFiber: { stateNode: { node: {} } } }],
    ['the node cannot be measured', { hitFiber: { _debugOwner: demo } }],
    ['the owner has no name', { hitFiber: { stateNode: { node: {} }, _debugOwner: { type: {} } } }],
  ])('misses when %s', (_label, options) => {
    const runtime = createRuntime(options);
    runInNewContext(buildHoverScript({ x: 0.5, y: 0.5 }), runtime.context);
    expect(parseHoverResult(runtime.readHover())).toEqual({ status: 'miss' });
  });

  it('reports unsupported runtimes', () => {
    const runtime = createRuntime({ noFabric: true });
    runInNewContext(buildHoverScript({ x: 0.5, y: 0.5 }), runtime.context);
    expect(parseHoverResult(runtime.readHover())).toEqual({ status: 'unsupported' });
  });
});

describe('parseHoverResult', () => {
  it.each([undefined, 'not json', '{"status":"pending"}', '{"status":"hit","name":"A","x":1,"y":1,"width":"1","height":1}', '{"status":"hit","x":0,"y":0,"width":1,"height":1}'])(
    'treats %j as pending',
    (raw) => {
      expect(parseHoverResult(raw)).toEqual({ status: 'pending' });
    },
  );

  it('rejects non finite rectangles', () => {
    expect(parseHoverResult(JSON.stringify({ status: 'hit', name: 'A', x: null, y: 0, width: 1, height: 1 }))).toEqual({ status: 'pending' });
  });

  it('sanitizes box edges', () => {
    const raw = JSON.stringify({ status: 'hit', name: 'A', x: 0, y: 0, width: 1, height: 1, margin: { top: -1, right: 'x', bottom: 0.5 }, padding: 3 });
    expect(parseHoverResult(raw)).toMatchObject({ rect: { margin: { top: 0, right: 0, bottom: 0.5, left: 0 }, padding: { top: 0, right: 0, bottom: 0, left: 0 } } });
  });

  it('keeps only well formed owners', () => {
    const raw = JSON.stringify({ status: 'hit', name: 'A', x: 0, y: 0, width: 1, height: 1, owners: [{ name: 'B', stack: 's', extra: 1 }, { name: 2 }, null] });
    expect(parseHoverResult(raw)).toMatchObject({ owners: [{ name: 'B', stack: 's' }] });
    expect(parseHoverResult(JSON.stringify({ status: 'hit', name: 'A', x: 0, y: 0, width: 1, height: 1 }))).toMatchObject({ owners: [] });
  });
});
