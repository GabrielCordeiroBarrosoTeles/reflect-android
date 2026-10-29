/// Fatal start-up errors. Reported as an `event` frame
/// `{"type":"error","code":…,"message":…}`, then the helper exits with `exitCode`.
public enum HelperError: Error, Equatable, Sendable {
    case xcodeUnsupported(String)
    case deviceNotFound(udid: String)
    case deviceNotBooted(state: String)
    case frameworkUnavailable(String)

    public static let exitCode: Int32 = 2

    public var code: String {
        switch self {
        case .xcodeUnsupported: "xcode-unsupported"
        case .deviceNotFound: "device-not-found"
        case .deviceNotBooted: "device-not-booted"
        case .frameworkUnavailable: "framework-unavailable"
        }
    }

    public var message: String {
        switch self {
        case .xcodeUnsupported(let detail), .frameworkUnavailable(let detail): detail
        case .deviceNotFound(let udid): "no simulator with UDID \(udid)"
        case .deviceNotBooted(let state): "simulator is not booted (state: \(state))"
        }
    }
}
