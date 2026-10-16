import type { VideoPacket } from '../shared/protocol';

type GateStage = 'awaiting-configuration' | 'awaiting-keyframe' | 'open';

export class PacketGate {
  private stage: GateStage = 'awaiting-configuration';

  reset(): void {
    this.stage = 'awaiting-configuration';
  }

  admit(packet: VideoPacket): boolean {
    if (packet.kind === 'configuration') {
      this.stage = 'awaiting-keyframe';
      return true;
    }
    if (this.stage === 'awaiting-configuration') {
      return false;
    }
    if (this.stage === 'awaiting-keyframe') {
      if (packet.keyframe === false) {
        return false;
      }
      this.stage = 'open';
    }
    return true;
  }
}
