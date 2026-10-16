// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { VideoPacket } from '../../src/shared/protocol';
import { PacketGate } from '../../src/webview/PacketGate';

const packet = (kind: VideoPacket['kind'], keyframe?: boolean): VideoPacket => ({ kind, data: new Uint8Array(), keyframe, pts: undefined });

describe('PacketGate', () => {
  it('drops data until configuration and a keyframe arrive', () => {
    const gate = new PacketGate();
    expect(gate.admit(packet('data', true))).toBe(false);
    expect(gate.admit(packet('configuration'))).toBe(true);
    expect(gate.admit(packet('data', false))).toBe(false);
    expect(gate.admit(packet('data', true))).toBe(true);
    expect(gate.admit(packet('data', false))).toBe(true);
  });

  it('treats packets without keyframe flag as keyframes', () => {
    const gate = new PacketGate();
    gate.admit(packet('configuration'));
    expect(gate.admit(packet('data'))).toBe(true);
  });

  it('closes again after reset', () => {
    const gate = new PacketGate();
    gate.admit(packet('configuration'));
    gate.admit(packet('data', true));
    gate.reset();
    expect(gate.admit(packet('data', false))).toBe(false);
  });
});
