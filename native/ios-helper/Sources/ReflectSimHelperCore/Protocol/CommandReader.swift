import Foundation

public enum CommandReader {
    /// Parses one stdin line. Never throws: bad input yields `.invalid`,
    /// an unrecognised `type` yields `.unknown(type)`.
    public static func parse(line: String) -> ParsedLine {
        guard let data = line.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String
        else { return .invalid }

        func num(_ k: String) -> Double? { (obj[k] as? NSNumber).map { $0.doubleValue } }
        func int(_ k: String) -> Int? { (obj[k] as? NSNumber).map { $0.intValue } }
        func bool(_ k: String) -> Bool? { obj[k] as? Bool }

        switch type {
        case "touch":
            guard let p = (obj["phase"] as? String).flatMap(TouchPhase.init(rawValue:)),
                  let x = num("x"), let y = num("y"), let id = int("id")
            else { return .invalid }
            return .command(.touch(phase: p, x: x, y: y, id: id))
        case "scroll":
            guard let x = num("x"), let y = num("y"), let dx = num("dx"), let dy = num("dy")
            else { return .invalid }
            return .command(.scroll(x: x, y: y, dx: dx, dy: dy))
        case "key":
            guard let u = int("usage"), u >= 0, let d = bool("down") else { return .invalid }
            return .command(.key(usage: UInt32(truncatingIfNeeded: u), down: d))
        case "button":
            guard let n = obj["name"] as? String, let d = bool("down") else { return .invalid }
            return .command(.button(name: n, down: d))
        case "rotate": return .command(.rotate)
        case "keyframe": return .command(.keyframe)
        case "stop": return .command(.stop)
        case "quality":
            guard let b = int("bitrate"), let f = int("fps"), let m = int("maxSize") else { return .invalid }
            return .command(.quality(bitrate: b, fps: f, maxSize: m))
        case "simulatorApp":
            guard let a = (obj["action"] as? String).flatMap(SimulatorAppAction.init(rawValue:))
            else { return .invalid }
            return .command(.simulatorApp(action: a))
        default:
            return .unknown(type)
        }
    }
}
