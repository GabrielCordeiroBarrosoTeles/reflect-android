import { describe, expect, it } from 'vitest';
import { createNonce } from '../../src/ui/webviewHtml';

describe('createNonce', () => {
  it('creates unique base64 nonces with 128 bits', () => {
    const first = createNonce();
    expect(Buffer.from(first, 'base64')).toHaveLength(16);
    expect(createNonce()).not.toBe(first);
  });
});
