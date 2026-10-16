import { Emitter } from '../core/Emitter';
import type { IDisposable } from '../core/types';
import type { ICdpSession } from './types';

export const DEVTOOLS_BINDING = '__CHROME_DEVTOOLS_FRONTEND_BINDING__';
const DISPATCHER = '__FUSEBOX_REACT_DEVTOOLS_DISPATCHER__';
const DOMAIN = 'react-devtools';

export interface DevToolsMessage {
  readonly event: string;
  readonly payload: unknown;
}

interface EvaluateResult {
  readonly result?: { readonly value?: unknown };
  readonly exceptionDetails?: { readonly text?: string; readonly exception?: { readonly description?: string } };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export class ReactDevToolsBackend implements IDisposable {
  private readonly messageEmitter = new Emitter<DevToolsMessage>();
  private readonly subscription: IDisposable;
  private nextRequestId = 0;

  readonly onMessage = this.messageEmitter.event;

  constructor(
    private readonly session: ICdpSession,
    private readonly timeoutMs: number,
  ) {
    this.subscription = session.onEvent(({ method, params }) => {
      if (method === 'Runtime.bindingCalled' && isRecord(params) && params.name === DEVTOOLS_BINDING) {
        this.handleBinding(params.payload);
      }
    });
  }

  async initialize(): Promise<void> {
    await this.session.send('Runtime.enable');
    await this.session.send('Runtime.addBinding', { name: DEVTOOLS_BINDING });
    await this.evaluate(`void ${DISPATCHER}.initializeDomain('${DOMAIN}')`);
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = (await this.session.send('Runtime.evaluate', { expression, returnByValue: true })) as EvaluateResult;
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? 'Evaluation failed');
    }
    return response.result?.value;
  }

  async inspectElement(id: number, rendererID: number): Promise<Record<string, unknown>> {
    this.nextRequestId += 1;
    const requestID = this.nextRequestId;
    const response = this.waitFor(
      (message) => message.event === 'inspectedElement' && isRecord(message.payload) && message.payload.responseID === requestID,
    );
    await this.post('inspectElement', { id, rendererID, requestID, forceFullData: true, path: null });
    return (await response).payload as Record<string, unknown>;
  }

  dispose(): void {
    this.subscription.dispose();
    this.messageEmitter.dispose();
  }

  private post(event: string, payload: unknown): Promise<unknown> {
    const message = JSON.stringify(JSON.stringify({ event, payload }));
    return this.evaluate(`${DISPATCHER}.sendMessage('${DOMAIN}', ${message})`);
  }

  private waitFor(matches: (message: DevToolsMessage) => boolean): Promise<DevToolsMessage> {
    return new Promise<DevToolsMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        subscription.dispose();
        reject(new Error('React DevTools did not answer'));
      }, this.timeoutMs);
      const subscription = this.onMessage((message) => {
        if (matches(message)) {
          clearTimeout(timer);
          subscription.dispose();
          resolve(message);
        }
      });
    });
  }

  private handleBinding(payload: unknown): void {
    if (typeof payload !== 'string') {
      return;
    }
    try {
      const parsed = JSON.parse(payload) as { domain?: unknown; message?: unknown };
      if (parsed.domain === DOMAIN && isRecord(parsed.message) && typeof parsed.message.event === 'string') {
        this.messageEmitter.fire({ event: parsed.message.event, payload: parsed.message.payload });
      }
    } catch {
      return;
    }
  }
}
