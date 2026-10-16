import type { BoxEdges } from '../shared/protocol';
import type { HitResult, HoverResult, HoverOwner, InspectPoint } from './types';

export const HIT_RESULT_GLOBAL = '__reflectInspectorHit';
export const HOVER_RESULT_GLOBAL = '__reflectInspectorHover';

const MAX_OWNER_DEPTH = 12;
const MAX_STACK_LINES = 8;

const findNodeScript = (resultGlobal: string, point: InspectPoint, onFound: string): string => `(() => {
  const NEWLINE = String.fromCharCode(10);
  const hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const fabric = globalThis.nativeFabricUIManager;
  globalThis.${resultGlobal} = { status: 'pending' };
  if (!hook || !fabric || typeof fabric.findNodeAtPoint !== 'function') {
    globalThis.${resultGlobal} = { status: 'unsupported' };
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
    globalThis.${resultGlobal} = { status: 'empty' };
    return;
  }
  const finish = (value) => {
    globalThis.${resultGlobal} = value;
  };
  fabric.measure(rootNode, (rootX, rootY, rootWidth, rootHeight) => {
    fabric.findNodeAtPoint(rootNode, ${point.x} * rootWidth, ${point.y} * rootHeight, (fiber) => {
      if (!fiber) {
        finish({ status: 'miss' });
        return;
      }
      ${onFound}
    });
  });
})()`;

export const buildHitTestScript = (point: InspectPoint): string =>
  findNodeScript(
    HIT_RESULT_GLOBAL,
    point,
    `const findElementId = () => {
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
      const element = findElementId();
      if (!element) {
        finish({ status: 'miss' });
        return;
      }
      const stacks = [];
      for (let owner = fiber, depth = 0; owner && depth < ${MAX_OWNER_DEPTH}; owner = owner._debugOwner, depth += 1) {
        if (owner._debugStack) stacks.push(String(owner._debugStack.stack).split(NEWLINE).slice(0, ${MAX_STACK_LINES}).join(NEWLINE));
      }
      finish({ status: 'hit', elementId: element.id, rendererID: element.rendererID, stacks });`,
  );

export const buildHoverScript = (point: InspectPoint): string =>
  findNodeScript(
    HOVER_RESULT_GLOBAL,
    point,
    `const nameOf = (owner) => (owner && owner.type && typeof owner.type !== 'string' ? owner.type.displayName || owner.type.name || null : null);
      const owners = [];
      for (let child = fiber, depth = 0; child && depth < ${MAX_OWNER_DEPTH}; child = child._debugOwner, depth += 1) {
        const name = nameOf(child._debugOwner);
        if (name && child._debugStack) owners.push({ name, stack: String(child._debugStack.stack).split(NEWLINE).slice(0, ${MAX_STACK_LINES}).join(NEWLINE) });
      }
      const node = fiber.stateNode && fiber.stateNode.node;
      const name = nameOf(fiber._debugOwner);
      if (!node || !name) {
        finish({ status: 'miss' });
        return;
      }
      const flatten = (style, into) => {
        if (Array.isArray(style)) style.forEach((entry) => flatten(entry, into));
        else if (style && typeof style === 'object') Object.assign(into, style);
        return into;
      };
      const style = flatten(fiber.memoizedProps && fiber.memoizedProps.style, {});
      const pick = (...values) => values.find((value) => typeof value === 'number') || 0;
      const edges = (prefix) => ({
        top: pick(style[prefix + 'Top'], style[prefix + 'Vertical'], style[prefix]) / rootHeight,
        right: pick(style[prefix + 'Right'], style[prefix + 'End'], style[prefix + 'Horizontal'], style[prefix]) / rootWidth,
        bottom: pick(style[prefix + 'Bottom'], style[prefix + 'Vertical'], style[prefix]) / rootHeight,
        left: pick(style[prefix + 'Left'], style[prefix + 'Start'], style[prefix + 'Horizontal'], style[prefix]) / rootWidth,
      });
      fabric.measure(node, (x, y, width, height, pageX, pageY) => {
        finish({
          status: 'hit',
          name,
          owners,
          x: pageX / rootWidth,
          y: pageY / rootHeight,
          width: width / rootWidth,
          height: height / rootHeight,
          margin: edges('margin'),
          padding: edges('padding'),
        });
      });`,
  );

export const READ_HIT_RESULT_SCRIPT = `JSON.stringify(globalThis.${HIT_RESULT_GLOBAL})`;
export const READ_HOVER_RESULT_SCRIPT = `JSON.stringify(globalThis.${HOVER_RESULT_GLOBAL})`;

type UnresolvedOutcome = { readonly status: 'pending' | 'unsupported' | 'empty' | 'miss' };

export type HitTestOutcome = UnresolvedOutcome | ({ readonly status: 'hit' } & HitResult);

export type HoverOutcome = UnresolvedOutcome | ({ readonly status: 'hit' } & HoverResult);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const parseRecord = (raw: unknown): Record<string, unknown> | undefined => {
  if (typeof raw !== 'string') {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
};

const unresolved = (value: Record<string, unknown>): UnresolvedOutcome =>
  value.status === 'unsupported' || value.status === 'empty' || value.status === 'miss' ? { status: value.status } : { status: 'pending' };

export const parseHitResult = (raw: unknown): HitTestOutcome => {
  const value = parseRecord(raw);
  if (!value) {
    return { status: 'pending' };
  }
  if (value.status === 'hit' && typeof value.elementId === 'number' && typeof value.rendererID === 'number') {
    const stacks = Array.isArray(value.stacks) ? value.stacks.filter((stack): stack is string => typeof stack === 'string') : [];
    return { status: 'hit', elementId: value.elementId, rendererID: value.rendererID, stacks };
  }
  return unresolved(value);
};

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const NO_EDGES: BoxEdges = { top: 0, right: 0, bottom: 0, left: 0 };

const parseEdges = (value: unknown): BoxEdges => {
  if (!isRecord(value)) {
    return NO_EDGES;
  }
  const side = (key: keyof BoxEdges): number => {
    const raw = value[key];
    return isFiniteNumber(raw) ? Math.max(0, raw) : 0;
  };
  return { top: side('top'), right: side('right'), bottom: side('bottom'), left: side('left') };
};

const isHoverOwner = (value: unknown): value is HoverOwner => isRecord(value) && typeof value.name === 'string' && typeof value.stack === 'string';

export const parseHoverResult = (raw: unknown): HoverOutcome => {
  const value = parseRecord(raw);
  if (!value) {
    return { status: 'pending' };
  }
  const { name, owners, x, y, width, height } = value;
  if (value.status === 'hit' && typeof name === 'string' && isFiniteNumber(x) && isFiniteNumber(y) && isFiniteNumber(width) && isFiniteNumber(height)) {
    const validOwners = Array.isArray(owners) ? owners.filter(isHoverOwner).map((owner) => ({ name: owner.name, stack: owner.stack })) : [];
    return { status: 'hit', name, owners: validOwners, rect: { x, y, width, height, margin: parseEdges(value.margin), padding: parseEdges(value.padding) } };
  }
  return unresolved(value);
};
