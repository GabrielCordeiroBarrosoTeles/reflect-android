public enum TouchPhase: String, Equatable, Sendable {
    case down, move, up
}

public enum SimulatorAppAction: String, Equatable, Sendable {
    case hide, show
}

/// Commands read from stdin, one JSON object per line. Coordinates are device points.
public enum Command: Equatable, Sendable {
    case touch(phase: TouchPhase, x: Double, y: Double, id: Int)
    case scroll(x: Double, y: Double, dx: Double, dy: Double)
    case key(usage: UInt32, down: Bool)
    case button(name: String, down: Bool)
    case rotate
    case keyframe
    case quality(bitrate: Int, fps: Int, maxSize: Int)
    case simulatorApp(action: SimulatorAppAction)
    case stop
}

public enum ParsedLine: Equatable, Sendable {
    case command(Command)
    case unknown(String)
    case invalid
}
