import { findUserFrame, parseStackFrames, toSourceLocation } from './stackFrames';
import type { HoverOwner, IMetroClient, SourceLocation, StackFrame } from './types';

export interface UserOwner {
  readonly name: string;
  readonly source: SourceLocation;
}

const COMPONENT_NAME = /^[A-Z][\w$]*$/;

export class UserOwnerResolver {
  private readonly frames = new Map<string, StackFrame | null>();

  constructor(
    private readonly metro: IMetroClient,
    private readonly maxEntries: number,
  ) {}

  async resolve(owners: readonly HoverOwner[]): Promise<UserOwner | undefined> {
    await this.symbolicate(owners.filter((owner) => !this.frames.has(owner.stack)));
    for (const owner of owners) {
      const frame = this.frames.get(owner.stack);
      if (frame) {
        return { name: COMPONENT_NAME.test(frame.methodName) ? frame.methodName : owner.name, source: toSourceLocation(frame) };
      }
    }
    return undefined;
  }

  clear(): void {
    this.frames.clear();
  }

  private async symbolicate(owners: readonly HoverOwner[]): Promise<void> {
    const framesByOwner = owners.map((owner) => ({ stack: owner.stack, frames: parseStackFrames([owner.stack]) }));
    const frames = framesByOwner.flatMap((entry) => entry.frames);
    if (frames.length === 0) {
      return;
    }
    const symbolicated = await this.metro.symbolicate(frames).catch(() => undefined);
    if (!symbolicated) {
      return;
    }
    if (this.frames.size + owners.length > this.maxEntries) {
      this.frames.clear();
    }
    let offset = 0;
    for (const entry of framesByOwner) {
      this.frames.set(entry.stack, findUserFrame(symbolicated.slice(offset, offset + entry.frames.length)) ?? null);
      offset += entry.frames.length;
    }
  }
}
