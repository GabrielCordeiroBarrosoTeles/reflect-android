import CIndigo
import Darwin
import Foundation

/// Hardware-keyboard keys as Indigo button messages: source `ButtonEventSourceKeyboard`
/// (`0x2710`), target `ButtonEventTargetKeyboard` (`0x64`), `keyCode` = USB HID usage
/// (page 0x07). The message is hand-built like idb's `FBSimulatorIndigoHID` keyboard
/// message (MIT), as adapted in simbeam-control `HIDController.swift` (Apache-2.0); the
/// mach header is left zeroed for `SimDeviceLegacyHIDClient` to fill. Main queue only.
final class KeyboardInjector {
    private let client: HIDClient

    init(client: HIDClient) {
        self.client = client
    }

    func key(usage: UInt32, down: Bool) throws {
        try client.send(Self.message(usage: usage, down: down, timestamp: mach_absolute_time()), "keyboard message")
    }

    /// A `calloc`ed single-payload Indigo message; the caller (or the HID client) frees it.
    static func message(usage: UInt32, down: Bool, timestamp: UInt64) -> UnsafeMutableRawPointer {
        let size = MemoryLayout<IndigoMessage>.size
        guard let raw = calloc(1, size) else { fatalError("cannot allocate an Indigo keyboard message") }
        let message = raw.assumingMemoryBound(to: IndigoMessage.self)
        message.pointee.innerSize = UInt32(MemoryLayout<IndigoPayload>.size)
        message.pointee.eventType = UInt8(IndigoEventTypeButton)
        message.pointee.payload.eventKind = 2
        message.pointee.payload.timestamp = timestamp
        message.pointee.payload.event.button.eventSource = UInt32(ButtonEventSourceKeyboard)
        message.pointee.payload.event.button.eventType = UInt32(down ? ButtonEventTypeDown : ButtonEventTypeUp)
        message.pointee.payload.event.button.eventTarget = UInt32(ButtonEventTargetKeyboard)
        message.pointee.payload.event.button.keyCode = usage
        return raw
    }
}
