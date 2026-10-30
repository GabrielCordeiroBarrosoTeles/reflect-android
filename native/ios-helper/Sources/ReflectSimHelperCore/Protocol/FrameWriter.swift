import Foundation

public enum FrameWriterError: Error, Equatable {
    /// The sink failed (stdout closed: the parent is gone). The helper should exit 0.
    case outputClosed
}

/// Serialises frames to an injectable byte sink (stdout in production).
/// Writes are serialised with a lock so frames never interleave.
/// A failing sink surfaces as `FrameWriterError.outputClosed`.
public final class FrameWriter: @unchecked Sendable {
    private let sink: @Sendable (Data) throws -> Void
    private let lock = NSLock()

    public init(sink: @escaping @Sendable (Data) throws -> Void) {
        self.sink = sink
    }

    /// Writes to stdout. With SIGPIPE ignored, a closed pipe makes the write throw (EPIPE).
    public static func stdout() -> FrameWriter {
        FrameWriter { data in
            try FileHandle.standardOutput.write(contentsOf: data)
        }
    }

    public func writeHello(_ hello: Hello) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        try write(.hello, try encoder.encode(hello))
    }

    public func writeVideoConfig(width: UInt16, height: UInt16, annexB: Data) throws {
        var p = Data()
        p.appendBE(width)
        p.appendBE(height)
        p.append(annexB)
        try write(.videoConfig, p)
    }

    public func writeVideoFrame(keyframe: Bool, pts: UInt64, payload: Data) throws {
        var p = Data([keyframe ? 0x01 : 0x00])
        p.appendBE(pts)
        p.append(payload)
        try write(.videoFrame, p)
    }

    public func writeEvent(type: String, message: String) throws {
        try writeEvent(["type": type, "message": message])
    }

    /// `{"type":"error","code":…,"message":…}`
    public func writeError(_ error: HelperError) throws {
        try writeEvent(["type": "error", "code": error.code, "message": error.message])
    }

    /// `{"type":"orientation-changed","orientation":…}`
    public func writeOrientationChanged(_ orientation: DeviceOrientation) throws {
        try writeEvent(["type": "orientation-changed", "orientation": orientation.name])
    }

    private func writeEvent(_ fields: [String: String]) throws {
        try write(.event, try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]))
    }

    private func write(_ type: FrameType, _ payload: Data) throws {
        var frame = Data([type.rawValue])
        frame.appendBE(UInt32(payload.count))
        frame.append(payload)
        lock.lock()
        defer { lock.unlock() }
        do {
            try sink(frame)
        } catch {
            throw FrameWriterError.outputClosed
        }
    }
}

extension Data {
    mutating func appendBE<T: FixedWidthInteger>(_ value: T) {
        Swift.withUnsafeBytes(of: value.bigEndian) { append(contentsOf: $0) }
    }
}
