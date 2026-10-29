import Foundation

/// Serialises frames to an injectable byte sink (stdout in production).
/// Writes are serialised with a lock so frames never interleave.
public final class FrameWriter: @unchecked Sendable {
    private let sink: @Sendable (Data) -> Void
    private let lock = NSLock()

    public init(sink: @escaping @Sendable (Data) -> Void) {
        self.sink = sink
    }

    public static func stdout() -> FrameWriter {
        FrameWriter { data in
            try? FileHandle.standardOutput.write(contentsOf: data)
        }
    }

    public func writeHello(_ hello: Hello) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        write(.hello, try encoder.encode(hello))
    }

    public func writeVideoConfig(width: UInt16, height: UInt16, annexB: Data) {
        var p = Data()
        p.appendBE(width)
        p.appendBE(height)
        p.append(annexB)
        write(.videoConfig, p)
    }

    public func writeVideoFrame(keyframe: Bool, pts: UInt64, payload: Data) {
        var p = Data([keyframe ? 0x01 : 0x00])
        p.appendBE(pts)
        p.append(payload)
        write(.videoFrame, p)
    }

    public func writeEvent(type: String, message: String) throws {
        let json = try JSONSerialization.data(
            withJSONObject: ["type": type, "message": message], options: [.sortedKeys])
        write(.event, json)
    }

    private func write(_ type: FrameType, _ payload: Data) {
        var frame = Data([type.rawValue])
        frame.appendBE(UInt32(payload.count))
        frame.append(payload)
        lock.lock()
        defer { lock.unlock() }
        sink(frame)
    }
}

extension Data {
    mutating func appendBE<T: FixedWidthInteger>(_ value: T) {
        Swift.withUnsafeBytes(of: value.bigEndian) { append(contentsOf: $0) }
    }
}
