const PROBE_CODEC = 'avc1.42E01E';

export interface DecoderSupport {
  readonly hardware: boolean;
  readonly software: boolean;
}

const isSupported = async (hardwareAcceleration: HardwareAcceleration): Promise<boolean> => {
  try {
    const result = await VideoDecoder.isConfigSupported({ codec: PROBE_CODEC, hardwareAcceleration });
    return result.supported === true;
  } catch {
    return false;
  }
};

export const probeDecoderSupport = async (): Promise<DecoderSupport> => {
  const [hardware, software] = await Promise.all([isSupported('prefer-hardware'), isSupported('prefer-software')]);
  return { hardware, software };
};

export const preferredAcceleration = (support: DecoderSupport): HardwareAcceleration =>
  support.hardware ? 'prefer-hardware' : 'no-preference';
