import { describe, expect, it, vi } from 'vitest';
import { UserOwnerResolver } from '../../src/inspector/UserOwnerResolver';
import type { IMetroClient, StackFrame } from '../../src/inspector/types';

const stack = (line: number) => `Error\n    at fn (http://b:${line}:1)\n    at fn (http://b:${line + 1}:1)`;

const frame = (file: string, lineNumber: number, methodName = 'anonymous'): StackFrame => ({ file, lineNumber, column: 1, methodName });

const setup = (maxEntries = 100) => {
  const files = new Map<number, StackFrame>([
    [1, frame('/app/node_modules/rn/Text.js', 1)],
    [2, frame('/app/node_modules/rn/Text.js', 2)],
    [3, frame('/app/node_modules/rn/View.js', 3)],
    [4, frame('/app/src/Card.tsx', 40, 'Card')],
    [5, frame('/app/src/Wrapped.tsx', 50, 'render')],
    [6, frame('/app/src/Wrapped.tsx', 51)],
  ]);
  const symbolicate = vi.fn((frames: readonly StackFrame[]) => Promise.resolve(frames.map((input) => files.get(input.lineNumber) ?? frame('/app/node_modules/x.js', 0))));
  const metro = { port: 8081, origins: [], listTargets: vi.fn(), symbolicate } as unknown as IMetroClient;
  return { symbolicate, resolver: new UserOwnerResolver(metro, maxEntries) };
};

describe('UserOwnerResolver', () => {
  it('finds the first owner rendered from user code in one symbolication', async () => {
    const { resolver, symbolicate } = setup();
    const owner = await resolver.resolve([
      { name: 'Text', stack: stack(1) },
      { name: 'Wrap', stack: stack(3) },
      { name: 'App', stack: stack(5) },
    ]);
    expect(owner).toEqual({ name: 'Card', source: { file: '/app/src/Card.tsx', line: 40, column: 1 } });
    expect(symbolicate).toHaveBeenCalledOnce();
    expect(symbolicate.mock.calls[0]?.[0]).toHaveLength(6);
  });

  it('falls back to the owner name when the frame is not named like a component', async () => {
    const { resolver } = setup();
    expect(await resolver.resolve([{ name: 'Wrapped', stack: stack(5) }])).toMatchObject({ name: 'Wrapped', source: { line: 50 } });
  });

  it('caches results, including library-only stacks', async () => {
    const { resolver, symbolicate } = setup();
    const owners = [{ name: 'Text', stack: stack(1) }];
    expect(await resolver.resolve(owners)).toBeUndefined();
    expect(await resolver.resolve(owners)).toBeUndefined();
    expect(symbolicate).toHaveBeenCalledOnce();
    resolver.clear();
    await resolver.resolve(owners);
    expect(symbolicate).toHaveBeenCalledTimes(2);
  });

  it('skips symbolication without frames and retries after failures', async () => {
    const { resolver, symbolicate } = setup();
    expect(await resolver.resolve([{ name: 'A', stack: 'no frames' }])).toBeUndefined();
    expect(symbolicate).not.toHaveBeenCalled();
    symbolicate.mockReturnValueOnce(Promise.reject(new Error('metro down')));
    expect(await resolver.resolve([{ name: 'Card', stack: stack(3) }])).toBeUndefined();
    expect(await resolver.resolve([{ name: 'Card', stack: stack(3) }])).toMatchObject({ name: 'Card' });
  });

  it('starts over when the cache would grow past its limit', async () => {
    const { resolver, symbolicate } = setup(1);
    await resolver.resolve([{ name: 'A', stack: stack(1) }]);
    await resolver.resolve([{ name: 'B', stack: stack(3) }]);
    await resolver.resolve([{ name: 'A', stack: stack(1) }]);
    expect(symbolicate).toHaveBeenCalledTimes(3);
  });
});
