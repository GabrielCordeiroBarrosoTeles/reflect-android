import type { Adb } from '@yume-chan/adb';
import { AdbScrcpyClient, AdbScrcpyOptionsLatest } from '@yume-chan/adb-scrcpy';
import { SCRCPY_SERVER_DEVICE_PATH } from './serverConstants';
import type { IScrcpyLauncher, IServerBinary, MirrorOptions, ScrcpyClientLike } from './types';

export class AdbScrcpyLauncher implements IScrcpyLauncher {
  async launch(adb: Adb, binary: IServerBinary, options: MirrorOptions): Promise<ScrcpyClientLike> {
    await AdbScrcpyClient.pushServer(adb, await binary.open(), SCRCPY_SERVER_DEVICE_PATH);
    const scrcpyOptions = new AdbScrcpyOptionsLatest(
      {
        video: true,
        audio: false,
        control: true,
        videoCodec: 'h264',
        maxSize: options.maxSize,
        videoBitRate: options.videoBitRate,
        maxFps: options.maxFps,
        stayAwake: true,
        clipboardAutosync: true,
        logLevel: 'info',
      },
      { version: binary.version },
    );
    return AdbScrcpyClient.start(adb, SCRCPY_SERVER_DEVICE_PATH, scrcpyOptions);
  }
}
