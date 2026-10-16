import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CAPTURES_DIRECTORY, resolveCapturesDirectory } from '../../src/capture/resolveCapturesDirectory';

describe('resolveCapturesDirectory', () => {
  it('uses the default folder inside the workspace', () => {
    expect(resolveCapturesDirectory(undefined, '/work')).toBe(join('/work', DEFAULT_CAPTURES_DIRECTORY));
    expect(resolveCapturesDirectory('   ', '/work')).toBe(join('/work', DEFAULT_CAPTURES_DIRECTORY));
  });

  it('resolves relative settings against the workspace and keeps absolute ones', () => {
    expect(resolveCapturesDirectory('shots', '/work')).toBe(join('/work', 'shots'));
    expect(resolveCapturesDirectory('/tmp/shots', '/work')).toBe('/tmp/shots');
  });

  it('falls back to the Pictures folder without a workspace', () => {
    expect(resolveCapturesDirectory('shots', undefined)).toBe(join(homedir(), 'Pictures', 'Reflect'));
  });
});
