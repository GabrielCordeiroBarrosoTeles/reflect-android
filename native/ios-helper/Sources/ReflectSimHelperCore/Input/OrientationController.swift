import Darwin
import Foundation

/// Interface orientation. Raw values are `UIDeviceOrientation`'s; names are the wire names
/// of the `orientation-changed` event.
public enum DeviceOrientation: UInt32, Sendable {
    case portrait = 1
    case portraitUpsideDown = 2
    case landscapeLeft = 3
    case landscapeRight = 4

    /// `rotate` cycles portrait → landscapeLeft → portraitUpsideDown → landscapeRight.
    public var next: DeviceOrientation {
        switch self {
        case .portrait: return .landscapeLeft
        case .landscapeLeft: return .portraitUpsideDown
        case .portraitUpsideDown: return .landscapeRight
        case .landscapeRight: return .portrait
        }
    }

    public var name: String {
        switch self {
        case .portrait: return "portrait"
        case .portraitUpsideDown: return "portraitUpsideDown"
        case .landscapeLeft: return "landscapeLeft"
        case .landscapeRight: return "landscapeRight"
        }
    }
}

@objc private protocol SimDeviceBootstrapLookup {
    @objc(lookup:error:)
    func lookup(_ name: String, error: AutoreleasingUnsafeMutablePointer<NSError?>?) -> UInt32
}

/// Rotates the simulator with a `GSEventTypeDeviceOrientationChanged` GSEvent sent to its
/// `PurpleWorkspacePort`, as Simulator.app does. Message layout adapted from
/// luispadron/baguette `OrientationEvent.swift` / `PurpleEventOrientation.swift`
/// (Apache-2.0), who took it from idb's `GSEvent.h` (MIT). The helper does not read the
/// guest's orientation: it assumes portrait at start and tracks what it sent.
final class OrientationController {
    static let portName = "PurpleWorkspacePort"

    private let device: NSObject
    private(set) var current = DeviceOrientation.portrait

    init(device: NSObject) {
        self.device = device
    }

    /// Sends the next orientation of the cycle and returns it.
    func rotate() throws -> DeviceOrientation {
        let target = current.next
        let port = try lookupPort()
        var bytes = Self.message(target, port: port)
        let result = bytes.withUnsafeMutableBytes { raw in
            mach_msg_send(raw.baseAddress!.assumingMemoryBound(to: mach_msg_header_t.self))
        }
        guard result == KERN_SUCCESS else {
            throw HelperError.frameworkUnavailable("cannot send the orientation event (mach_msg_send \(result))")
        }
        current = target
        return target
    }

    /// The 112-byte GSEvent mach message: header (`COPY_SEND`, size 108, `msgh_id` 0x7B),
    /// GSEvent type 50 | host flag, a 4-byte record holding the orientation.
    static func message(_ orientation: DeviceOrientation, port: mach_port_t) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: 112)
        func put(_ value: UInt32, at offset: Int) {
            withUnsafeBytes(of: value.littleEndian) { bytes.replaceSubrange(offset..<offset + 4, with: $0) }
        }
        put(0x13, at: 0x00)
        put(108, at: 0x04)
        put(port, at: 0x08)
        put(0x7b, at: 0x14)
        put(50 | 0x20000, at: 0x18)
        put(4, at: 0x48)
        put(orientation.rawValue, at: 0x4c)
        return bytes
    }

    private func lookupPort() throws -> mach_port_t {
        let device = device
        guard try ObjCGuard.call("SimDevice.respondsToSelector:", { ObjC.responds(device, to: ["lookup:error:"]) })
        else { throw HelperError.frameworkUnavailable("SimDevice does not answer lookup:error:") }
        var error: NSError?
        let port = try ObjCGuard.call("SimDevice lookup:error:") {
            ObjC.as(device, SimDeviceBootstrapLookup.self).lookup(Self.portName, error: &error)
        }
        guard port != 0 else {
            throw HelperError.frameworkUnavailable(
                "\(Self.portName) is unavailable: \(error?.localizedDescription ?? "unknown error")")
        }
        return port
    }
}
