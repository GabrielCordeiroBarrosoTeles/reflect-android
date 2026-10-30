import Foundation

/// Darwin notifications posted inside the simulator with `simctl spawn … notifyutil -p`.
/// The Shake notification name comes from simbeam-control `HIDController.swift` (Apache-2.0).
/// `shake()` blocks while `simctl` runs: call it off the main queue.
public struct NotifyEvents: Sendable {
    static let shakeNotification = "com.apple.UIKit.SimulatorShake"

    private let udid: String
    private let runner: CommandRunning

    public init(udid: String, runner: CommandRunning) {
        self.udid = udid
        self.runner = runner
    }

    public func shake() throws {
        try post(Self.shakeNotification)
    }

    private func post(_ name: String) throws {
        _ = try runner.run("/usr/bin/xcrun", ["simctl", "spawn", udid, "notifyutil", "-p", name])
    }
}
