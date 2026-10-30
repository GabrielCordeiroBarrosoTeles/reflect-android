import CoreGraphics
import Foundation

/// The production `InputSink`: touches, buttons, keys and rotation on a booted simulator.
///
/// The HID client is connected by `prepare()` (or the first input), never during start-up,
/// so a simulator that refuses it only loses input, not video. Any failure (a missing symbol or selector, an Objective-C
/// exception from SimulatorKit) is reported once as a `framework-unavailable` error event
/// and later failures are only logged. Call from the main queue: the Indigo builders read
/// AppKit thread state. Shake runs `simctl` on a background queue.
public final class SimulatorInput: InputSink {
    private let device: NSObject
    private let resolver: SymbolResolving
    private let pointSize: CGSize
    private let notify: NotifyEvents
    private let onError: (HelperError) -> Void
    private let onWarning: @Sendable (String) -> Void
    private let onOrientation: (DeviceOrientation) -> Void
    private let log: (String) -> Void
    private let orientation: OrientationController
    private let shakeQueue = DispatchQueue(label: "reflect.input.notify")

    private var injectors: (touch: TouchInjector, buttons: ButtonInjector, keyboard: KeyboardInjector)?
    private var reportedFailure = false

    public init(
        device: NSObject,
        udid: String,
        resolver: SymbolResolving,
        pointSize: CGSize,
        runner: CommandRunning,
        onError: @escaping (HelperError) -> Void,
        onWarning: @escaping @Sendable (String) -> Void,
        onOrientation: @escaping (DeviceOrientation) -> Void,
        log: @escaping (String) -> Void
    ) {
        self.device = device
        self.resolver = resolver
        self.pointSize = pointSize
        self.notify = NotifyEvents(udid: udid, runner: runner)
        self.onError = onError
        self.onWarning = onWarning
        self.onOrientation = onOrientation
        self.log = log
        self.orientation = OrientationController(device: device)
    }

    /// Connects the HID client and creates the touch services ahead of the first input.
    public func prepare() {
        perform("prepare input") { try $0.touch.warmUp() }
    }

    public func touch(_ phase: TouchPhase, at point: CGPoint, id: UInt32) {
        perform("touch") { try $0.touch.touch(phase, at: point, id: id) }
    }

    public func key(usage: UInt32, down: Bool) {
        perform("key") { try $0.keyboard.key(usage: usage, down: down) }
    }

    public func button(_ name: ButtonName, down: Bool) {
        if name == .shake {
            guard down else { return }
            let notify = notify, onWarning = onWarning
            shakeQueue.async {
                do { try notify.shake() } catch { onWarning("shake failed: \(error)") }
            }
            return
        }
        perform("button \(name.rawValue)") { try $0.buttons.button(name, down: down) }
    }

    public func rotate() {
        do {
            onOrientation(try orientation.rotate())
        } catch {
            fail("rotate", error)
        }
    }

    private func perform(
        _ what: String,
        _ body: ((touch: TouchInjector, buttons: ButtonInjector, keyboard: KeyboardInjector)) throws -> Void
    ) {
        do {
            try body(try connect())
        } catch {
            fail(what, error)
        }
    }

    private func connect() throws -> (touch: TouchInjector, buttons: ButtonInjector, keyboard: KeyboardInjector) {
        if let injectors { return injectors }
        let functions = try IndigoFunctions(resolver: resolver)
        let client = try HIDClient(device: device)
        let created = (
            touch: TouchInjector(functions: functions, client: client, pointSize: pointSize),
            buttons: ButtonInjector(functions: functions, client: client),
            keyboard: KeyboardInjector(client: client))
        injectors = created
        log("HID client connected")
        return created
    }

    private func fail(_ what: String, _ error: Error) {
        let helperError = (error as? HelperError) ?? .frameworkUnavailable("\(error)")
        log("\(what) failed: \(helperError.message)")
        guard !reportedFailure else { return }
        reportedFailure = true
        onError(helperError)
    }
}
