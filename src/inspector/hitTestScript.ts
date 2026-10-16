import type { HitResult, InspectPoint } from './types';

export const HIT_RESULT_GLOBAL = '__reflectInspectorHit';

const MAX_OWNER_DEPTH = 12;
const MAX_STACK_LINES = 8;

export const buildHitTestScript = (point: InspectPoint): string => `(() => {
  const NEWLINE = String.fromCharCode(10);
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const fabric = globalThis.nativeFabricUIManager;
  globalThis.${HIT_RESULT_GLOBAL} = { status: 'pending' };
  if (!hook || !fabric || typeof fabric.findNodeAtPoint !== 'function') {
    globalThis.${HIT_RESULT_GLOBAL} = { status: 'unsupported' };
    return;
  }
  const findRootNode = () => {
    for (const rendererID of hook.renderers.keys()) {
      for (const root of hook.getFiberRoots(rendererID)) {
        let fiber = root.current;
        while (fiber && !(fiber.stateNode && fiber.stateNode.node)) fiber = fiber.child;
        if (fiber) return fiber.stateNode.node;
      }
    }
    return null;
  };
  const rootNode = findRootNode();
  if (!rootNode) {
    globalThis.${HIT_RESULT_GLOBAL} = { status: 'empty' };
    return;
  }
  const findElementId = (fiber) => {
    const stateNode = fiber.stateNode || {};
    const canonical = stateNode.canonical || {};
    for (const [rendererID, rendererInterface] of hook.rendererInterfaces) {
      for (const candidate of [stateNode, canonical.publicInstance]) {
        if (!candidate) continue;
        try {
          const id = rendererInterface.getElementIDForHostInstance(candidate);
          if (typeof id === 'number') return { id, rendererID };
        } catch (error) {}
      }
    }
    return null;
  };
  fabric.measure(rootNode, (x, y, width, height) => {
    fabric.findNodeAtPoint(rootNode, ${point.x} * width, ${point.y} * height, (fiber) => {
      const element = fiber ? findElementId(fiber) : null;
      if (!element) {
        globalThis.${HIT_RESULT_GLOBAL} = { status: 'miss' };
        return;
      }
      const stacks = [];
      for (let owner = fiber, depth = 0; owner && depth < ${MAX_OWNER_DEPTH}; owner = owner._debugOwner, depth += 1) {
        if (owner._debugStack) stacks.push(String(owner._debugStack.stack).split(NEWLINE).slice(0, ${MAX_STACK_LINES}).join(NEWLINE));
      }
      globalThis.${HIT_RESULT_GLOBAL} = { status: 'hit', elementId: element.id, rendererID: element.rendererID, stacks };
    });
  });
})()`;

export const READ_HIT_RESULT_SCRIPT = `JSON.stringify(globalThis.${HIT_RESULT_GLOBAL})`;

export type HitTestOutcome =
  | { readonly status: 'pending' | 'unsupported' | 'empty' | 'miss' }
  | ({ readonly status: 'hit' } & HitResult);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export const parseHitResult = (raw: unknown): HitTestOutcome => {
  if (typeof raw !== 'string') {
    return { status: 'pending' };
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { status: 'pending' };
  }
  if (!isRecord(value)) {
    return { status: 'pending' };
  }
  if (value.status === 'hit' && typeof value.elementId === 'number' && typeof value.rendererID === 'number') {
    const stacks = Array.isArray(value.stacks) ? value.stacks.filter((stack): stack is string => typeof stack === 'string') : [];
    return { status: 'hit', elementId: value.elementId, rendererID: value.rendererID, stacks };
  }
  if (value.status === 'unsupported' || value.status === 'empty' || value.status === 'miss') {
    return { status: value.status };
  }
  return { status: 'pending' };
};
