export type CaptureKind = 'screenshot' | 'recording';

export interface ICaptureStore {
  save(bytes: Uint8Array, extension: string, label: string): Promise<string>;
  reserve(extension: string, label: string): Promise<string>;
}
