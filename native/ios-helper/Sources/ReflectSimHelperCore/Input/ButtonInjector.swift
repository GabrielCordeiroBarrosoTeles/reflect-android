import Foundation

/// Hardware buttons. Home, lock and Siri are `IndigoHIDMessageForButton(source, direction,
/// 0x33)`; volume goes through `IndigoHIDMessageForHIDArbitrary` with consumer-page usages;
/// the app switcher is two Home presses. Codes adapted from luispadron/baguette
/// `IndigoHIDInput.swift` and `CoordinateTypes.swift` (Apache-2.0) and the idb/simbeam-control
/// `ButtonEventSource*` defines in `Indigo.h`. Main queue only.
final class ButtonInjector {
    enum Route: Equatable {
        case indigoButton(source: UInt32, target: UInt32)
        case hidArbitrary(page: UInt32, usage: UInt32)
        case doubleHome
        case shake
    }

    /// `ButtonEventTargetHardware`.
    static let hardwareTarget: UInt32 = 0x33
    /// The digitizer target `IndigoHIDMessageForHIDArbitrary` routes through.
    static let arbitraryTarget: UInt32 = 0x32
    static let down: UInt32 = 1
    static let up: UInt32 = 2
    /// How long each Home press of the app-switcher double press is held, and the gap
    /// between the two presses.
    static let pressHoldMicros: UInt32 = 50_000
    static let doublePressGapMicros: UInt32 = 150_000

    static func route(for name: ButtonName) -> Route {
        switch name {
        case .home: return .indigoButton(source: 0x0, target: hardwareTarget)
        case .lock: return .indigoButton(source: 0x1, target: hardwareTarget)
        case .siri: return .indigoButton(source: 0x400002, target: hardwareTarget)
        case .volumeUp: return .hidArbitrary(page: 12, usage: 233)
        case .volumeDown: return .hidArbitrary(page: 12, usage: 234)
        case .appSwitcher: return .doubleHome
        case .shake: return .shake
        }
    }

    private let functions: IndigoFunctions
    private let client: HIDClient

    init(functions: IndigoFunctions, client: HIDClient) {
        self.functions = functions
        self.client = client
    }

    /// Sends the press or release. The app switcher fires on press only; shake is not a
    /// HID button (see `NotifyEvents`) and is ignored here.
    func button(_ name: ButtonName, down: Bool) throws {
        let direction = down ? Self.down : Self.up
        switch Self.route(for: name) {
        case .indigoButton(let source, let target):
            try client.send(functions.button(source, direction, target), "IndigoHIDMessageForButton")
        case .hidArbitrary(let page, let usage):
            try client.send(
                functions.hidArbitrary(Self.arbitraryTarget, page, usage, direction),
                "IndigoHIDMessageForHIDArbitrary")
        case .doubleHome:
            guard down else { return }
            try pressHome()
            usleep(Self.doublePressGapMicros)
            try pressHome()
        case .shake:
            break
        }
    }

    private func pressHome() throws {
        try button(.home, down: true)
        usleep(Self.pressHoldMicros)
        try button(.home, down: false)
    }
}
