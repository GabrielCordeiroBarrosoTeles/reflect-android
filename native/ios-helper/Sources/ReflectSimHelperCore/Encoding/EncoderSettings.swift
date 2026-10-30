import CoreGraphics

/// Encoder knobs set from the CLI (`--fps`, `--bitrate`, `--max-size`) and the `quality`
/// command. Nonsense values are clamped so a bad command never breaks the session.
public struct EncoderSettings: Equatable, Sendable {
    public static let minimumBitrate = 100_000

    public let fps: Int
    public let bitrate: Int
    /// Longest output side in pixels; `<= 0` means no limit.
    public let maxSize: Int

    public init(fps: Int, bitrate: Int, maxSize: Int) {
        self.fps = max(1, fps)
        self.bitrate = max(Self.minimumBitrate, bitrate)
        self.maxSize = maxSize
    }

    /// One keyframe at least every two seconds.
    public var maxKeyFrameInterval: Int { fps * 2 }

    /// Scales `source` so its longest side is at most `maxSize` (never upscales) and rounds
    /// both sides down to even, which H.264 4:2:0 requires (1179×2556 @1920 → 884×1920).
    public func outputSize(for source: CGSize) -> CGSize {
        let width = Int(source.width), height = Int(source.height)
        let longest = max(width, height)
        // Integer maths so the longest side lands exactly on maxSize (no 1919.999…).
        func scaled(_ side: Int) -> Int {
            maxSize > 0 && longest > maxSize ? side * maxSize / longest : side
        }
        func even(_ side: Int) -> CGFloat { CGFloat(max(2, side & ~1)) }
        return CGSize(width: even(scaled(width)), height: even(scaled(height)))
    }
}
