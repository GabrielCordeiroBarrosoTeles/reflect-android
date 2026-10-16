import { describe, expect, it, vi } from 'vitest';

const { pushServer, start, optionsInit } = vi.hoisted(() => ({
  pushServer: vi.fn(() => Promise.resolve()),
  start: vi.fn(() => Promise.resolve('client')),
  optionsInit: vi.fn(),
}));

vi.mock('@yume-chan/adb-scrcpy', () => ({
  AdbScrcpyClient: { pushServer, start },
  AdbScrcpyOptionsLatest: class {
    constructor(...args: unknown[]) {
      optionsInit(...args);
    }
  },
}));

const { AdbScrcpyLauncher } = await import('../../src/scrcpy/AdbScrcpyLauncher');
const { SCRCPY_SERVER_DEVICE_PATH } = await import('../../src/scrcpy/serverConstants');

describe('AdbScrcpyLauncher', () => {
  it('pushes the server and starts it with low-latency video and control', async () => {
    const adb = {} as never;
    const stream = {};
    const binary = { version: '3.3.3', open: () => Promise.resolve(stream as never) };
    const client = await new AdbScrcpyLauncher().launch(adb, binary, { maxSize: 1600, videoBitRate: 4_000_000, maxFps: 30 });
    expect(client).toBe('client');
    expect(pushServer).toHaveBeenCalledWith(adb, stream, SCRCPY_SERVER_DEVICE_PATH);
    expect(optionsInit).toHaveBeenCalledWith(
      expect.objectContaining({
        video: true,
        audio: false,
        control: true,
        videoCodec: 'h264',
        maxSize: 1600,
        videoBitRate: 4_000_000,
        maxFps: 30,
        stayAwake: true,
        clipboardAutosync: true,
      }),
      { version: '3.3.3' },
    );
    expect(start).toHaveBeenCalledWith(adb, SCRCPY_SERVER_DEVICE_PATH, expect.anything());
  });
});
