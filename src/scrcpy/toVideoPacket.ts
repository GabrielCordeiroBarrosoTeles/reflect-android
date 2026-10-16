import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { VideoPacket } from '../shared/protocol';

const detach = (data: Uint8Array): Uint8Array => new Uint8Array(data);

export const toVideoPacket = (packet: ScrcpyMediaStreamPacket): VideoPacket =>
  packet.type === 'configuration'
    ? { kind: 'configuration', data: detach(packet.data), keyframe: undefined, pts: undefined }
    : {
        kind: 'data',
        data: detach(packet.data),
        keyframe: packet.keyframe,
        pts: packet.pts === undefined ? undefined : Number(packet.pts),
      };
