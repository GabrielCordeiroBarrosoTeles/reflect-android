import CoreGraphics
import Foundation

/// Hardware buttons the `button` command understands.
public enum ButtonName: String, CaseIterable, Sendable {
    case home, lock, volumeUp, volumeDown, siri, shake, appSwitcher
}

/// Where input ends up. Points are device points, already clamped to the screen.
/// `scroll` never reaches the sink: the dispatcher turns it into touches.
/// Production: `SimulatorInput`.
public protocol InputSink: AnyObject {
    func touch(_ phase: TouchPhase, at point: CGPoint, id: UInt32)
    func key(usage: UInt32, down: Bool)
    func button(_ name: ButtonName, down: Bool)
    func rotate()
}

/// Maps input `Command`s to an `InputSink`: clamps points to `[0, pointSize]`, turns
/// `scroll` into a short drag by (dx, dy) (ruling R3) and rejects unknown button names
/// with a warning. Non-input commands are ignored. Not thread-safe: call from one queue
/// (the main queue in production).
public final class InputDispatcher {
    /// Number of moves in a scroll drag.
    static let scrollSteps = 6
    /// Pause between scroll drag events, in microseconds (~one 60 Hz frame).
    static let scrollStepMicros: UInt32 = 16_000
    /// Scroll drags use their own touch ids, well above the ids the extension sends.
    static let firstScrollId: UInt32 = 0x1_0000

    private let sink: InputSink
    private let pointSize: CGSize
    private let onWarning: (String) -> Void
    private let pause: (UInt32) -> Void
    private var nextScrollId = firstScrollId

    public init(
        sink: InputSink,
        pointSize: CGSize,
        onWarning: @escaping (String) -> Void = { _ in },
        pause: @escaping (UInt32) -> Void = { usleep($0) }
    ) {
        self.sink = sink
        self.pointSize = pointSize
        self.onWarning = onWarning
        self.pause = pause
    }

    public func dispatch(_ command: Command) {
        switch command {
        case .touch(let phase, let x, let y, let id):
            sink.touch(phase, at: clamp(x, y), id: UInt32(truncatingIfNeeded: id))
        case .scroll(let x, let y, let dx, let dy):
            drag(from: clamp(x, y), to: clamp(x + dx, y + dy))
        case .key(let usage, let down):
            sink.key(usage: usage, down: down)
        case .button(let name, let down):
            guard let button = ButtonName(rawValue: name) else {
                onWarning("unknown button \(name)")
                return
            }
            sink.button(button, down: down)
        case .rotate:
            sink.rotate()
        case .keyframe, .quality, .simulatorApp, .stop:
            break
        }
    }

    /// down at `start`, `scrollSteps` interpolated moves, up at `end`, one fresh id.
    private func drag(from start: CGPoint, to end: CGPoint) {
        let id = nextScrollId
        nextScrollId = nextScrollId == UInt32.max ? Self.firstScrollId : nextScrollId + 1
        sink.touch(.down, at: start, id: id)
        for step in 1...Self.scrollSteps {
            pause(Self.scrollStepMicros)
            let t = Double(step) / Double(Self.scrollSteps)
            let point = CGPoint(x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t)
            sink.touch(.move, at: point, id: id)
        }
        pause(Self.scrollStepMicros)
        sink.touch(.up, at: end, id: id)
    }

    private func clamp(_ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: min(max(x, 0), pointSize.width), y: min(max(y, 0), pointSize.height))
    }
}
