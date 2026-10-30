import AppKit

/// Hides or shows Simulator.app (public `NSRunningApplication` API). A no-op when it is not
/// running. Main queue.
public enum SimulatorAppWindow {
    public static let bundleIdentifier = "com.apple.iphonesimulator"

    public static func hide() {
        running().forEach { $0.hide() }
    }

    public static func show() {
        running().forEach { $0.unhide() }
    }

    public static func apply(_ action: SimulatorAppAction) {
        switch action {
        case .hide: hide()
        case .show: show()
        }
    }

    private static func running() -> [NSRunningApplication] {
        NSRunningApplication.runningApplications(withBundleIdentifier: bundleIdentifier)
    }
}
