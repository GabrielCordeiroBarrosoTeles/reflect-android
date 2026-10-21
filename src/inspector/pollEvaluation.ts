import type { ReactDevToolsBackend } from './ReactDevToolsBackend';

export interface PollTiming {
  readonly pollIntervalMs: number;
  readonly pollAttempts: number;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const pollEvaluation = async <T extends { readonly status: string }>(
  backend: Pick<ReactDevToolsBackend, 'evaluate'>,
  script: string,
  parse: (raw: unknown) => T,
  timing: PollTiming,
): Promise<Exclude<T, { status: 'pending' }> | { status: 'miss' }> => {
  for (let attempt = 0; attempt < timing.pollAttempts; attempt += 1) {
    const outcome = parse(await backend.evaluate(script));
    if (outcome.status !== 'pending') {
      return outcome as Exclude<T, { status: 'pending' }>;
    }
    await delay(timing.pollIntervalMs);
  }
  return { status: 'miss' };
};
