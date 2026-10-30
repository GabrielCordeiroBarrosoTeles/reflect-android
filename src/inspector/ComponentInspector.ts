import type { Device } from '../devices/types';
import type { InspectHighlight } from '../shared/protocol';
import { buildHitTestScript, buildHoverScript, parseHitResult, parseHoverResult, READ_HIT_RESULT_SCRIPT, READ_HOVER_RESULT_SCRIPT } from './hitTestScript';
import type { MetroConnection } from './MetroConnection';
import { pollEvaluation } from './pollEvaluation';
import type { ReactDevToolsBackend } from './ReactDevToolsBackend';
import { findUserSource, parseStackFrames } from './stackFrames';
import { toInspectedComponent } from './toInspectedComponent';
import { UserOwnerResolver } from './UserOwnerResolver';
import type { IComponentInspector, IMetroClient, InspectedComponent, InspectPoint, SourceLocation } from './types';

export interface InspectorTiming {
  readonly pollIntervalMs: number;
  readonly pollAttempts: number;
  readonly timeoutMs: number;
}

const OWNER_CACHE_SIZE = 2_000;

const describeLocation = ({ file, line }: SourceLocation): string => `${file.split('/').pop()}:${line}`;

export class ComponentInspector implements IComponentInspector {
  private readonly owners: UserOwnerResolver;

  constructor(
    private readonly connections: MetroConnection,
    private readonly metro: IMetroClient,
    private readonly timing: InspectorTiming,
  ) {
    this.owners = new UserOwnerResolver(metro, OWNER_CACHE_SIZE);
  }

  async inspectAt(device: Device, point: InspectPoint): Promise<InspectedComponent | undefined> {
    const { backend } = await this.connections.connectionFor(device);
    await backend.evaluate(buildHitTestScript(point));
    const hit = await this.poll(backend, READ_HIT_RESULT_SCRIPT, parseHitResult);
    if (hit.status !== 'hit') {
      return undefined;
    }
    const payload = await backend.inspectElement(hit.elementId, hit.rendererID);
    return toInspectedComponent(payload, await this.resolveSource(hit.stacks));
  }

  async highlightAt(device: Device, point: InspectPoint): Promise<InspectHighlight | undefined> {
    const { backend } = await this.connections.connectionFor(device);
    await backend.evaluate(buildHoverScript(point));
    const hover = await this.poll(backend, READ_HOVER_RESULT_SCRIPT, parseHoverResult);
    if (hover.status !== 'hit') {
      return undefined;
    }
    const owner = await this.owners.resolve(hover.owners);
    const location = owner && describeLocation(owner.source);
    return { name: hover.name, owner: owner?.name === hover.name ? undefined : owner?.name, location, ...hover.rect };
  }

  disconnect(): void {
    this.connections.disconnect();
    this.owners.clear();
  }

  dispose(): void {
    this.disconnect();
  }

  private poll<T extends { readonly status: string }>(backend: ReactDevToolsBackend, script: string, parse: (raw: unknown) => T): Promise<Exclude<T, { status: 'pending' }> | { status: 'miss' }> {
    return pollEvaluation(backend, script, parse, this.timing);
  }

  private async resolveSource(stacks: readonly string[]): Promise<SourceLocation | undefined> {
    const frames = parseStackFrames(stacks);
    if (frames.length === 0) {
      return undefined;
    }
    const symbolicated = await this.metro.symbolicate(frames).catch(() => []);
    return findUserSource(symbolicated);
  }
}
