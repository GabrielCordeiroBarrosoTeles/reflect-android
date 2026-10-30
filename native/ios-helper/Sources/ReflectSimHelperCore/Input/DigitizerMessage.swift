import Foundation

/// Fix-ups for the Indigo message `IndigoHIDMessageForTrackpadEventFromHIDEventRef` builds
/// from a digitizer `IOHIDEvent` (spec §4.1). The wrapper leaves two slots uninitialised:
///
/// - the touch target (`0x32`, the digitizer) at `0x6c`, and at `0x10c` in the second
///   record of a two-record message;
/// - the screen-edge flags at `0x3a/0x3b` (and `0xda/0xdb`), zeroed for interior touches.
///
/// Offsets and values adapted from luispadron/baguette `IOHIDDigitizerDispatch.swift`
/// (Apache-2.0); Reflect only sends interior touches, so the edge bytes are always zero.
public enum DigitizerMessage {
    static let touchTarget: UInt32 = 0x32

    public static func patch(_ raw: UnsafeMutableRawPointer, size: Int) {
        storeTarget(raw, at: 0x6c, size: size)
        storeTarget(raw, at: 0x10c, size: size)
        for offset in [0x3a, 0x3b, 0xda, 0xdb] where offset < size {
            raw.storeBytes(of: UInt8(0), toByteOffset: offset, as: UInt8.self)
        }
    }

    private static func storeTarget(_ raw: UnsafeMutableRawPointer, at offset: Int, size: Int) {
        guard offset + 4 <= size else { return }
        raw.storeBytes(of: touchTarget.littleEndian, toByteOffset: offset, as: UInt32.self)
    }
}
