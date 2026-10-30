import AppKit

/// Hides, shows or quits Simulator.app (public `NSRunningApplication` API). A no-op when it is
/// not running. Main queue.
public enum SimulatorAppWindow {
    public static let bundleIdentifier = "com.apple.iphonesimulator"

    /// Simulator.app preference: when set, quitting the app detaches from booted devices
    /// instead of shutting them down, so the mirror keeps running.
    static let detachOnQuitKey = "DetachOnAppQuit"

    public static func hide() {
        running().forEach { $0.hide() }
    }

    public static func show() {
        running().forEach { $0.unhide() }
    }

    public static func quit() {
        if let defaults = UserDefaults(suiteName: bundleIdentifier) {
            keepDevicesRunningOnQuit(defaults)
        }
        running().forEach { $0.terminate() }
    }

    static func keepDevicesRunningOnQuit(_ defaults: UserDefaults) {
        defaults.set(true, forKey: detachOnQuitKey)
        defaults.synchronize()
    }

    public static func apply(_ action: SimulatorAppAction) {
        switch action {
        case .hide: hide()
        case .show: show()
        case .quit: quit()
        }
    }

    private static func running() -> [NSRunningApplication] {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
    }
}
