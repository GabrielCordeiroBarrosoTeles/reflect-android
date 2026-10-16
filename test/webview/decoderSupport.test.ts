// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { preferredAcceleration, probeDecoderSupport } from '../../src/webview/decoderSupport';

const stubDecoder = (isConfigSupported: (config: VideoDecoderConfig) => Promise<{ supported?: boolean }>) => {
  vi.stubGlobal('VideoDecoder', { isConfigSupported });
};

describe('probeDecoderSupport', () => {
  it('reports hardware and software support separately', async () => {
    stubDecoder((config) => Promise.resolve({ supported: config.hardwareAcceleration === 'prefer-hardware' }));
    expect(await probeDecoderSupport()).toEqual({ hardware: true, software: false });
  });

  it('probes H.264 baseline', async () => {
    const probe = vi.fn(() => Promise.resolve({ supported: true }));
    stubDecoder(probe);
    await probeDecoderSupport();
    expect(probe).toHaveBeenCalledWith({ codec: 'avc1.42E01E', hardwareAcceleration: 'prefer-software' });
  });

  it('treats probe failures as unsupported', async () => {
    stubDecoder(() => Promise.reject(new Error('NotSupportedError')));
    expect(await probeDecoderSupport()).toEqual({ hardware: false, software: false });
  });

  it('treats a missing supported flag as unsupported', async () => {
    stubDecoder(() => Promise.resolve({}));
    expect(await probeDecoderSupport()).toEqual({ hardware: false, software: false });
  });
});

describe('preferredAcceleration', () => {
  it('prefers hardware when available', () => {
    expect(preferredAcceleration({ hardware: true, software: true })).toBe('prefer-hardware');
    expect(preferredAcceleration({ hardware: false, software: true })).toBe('no-preference');
  });
});
