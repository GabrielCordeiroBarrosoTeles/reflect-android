import CoreFoundation
import CoreGraphics
import Darwin
import Foundation

/// Single-finger touches with the digitizer recipe from spec §4.1, adapted from
/// luispadron/baguette `IOHIDDigitizerDispatch.swift` (Apache-2.0): an
/// `IOHIDEventCreateDigitizerEvent` parent with an `IOHIDEventCreateDigitizerFingerEvent`
/// child, wrapped by `IndigoHIDMessageForTrackpadEventFromHIDEventRef`, patched by
/// `DigitizerMessage` and sent through `SimDeviceLegacyHIDClient`. The pointer and mouse
/// services are created once, before the first touch. Main queue only (the Indigo
/// builders read AppKit thread state).
final class TouchInjector {
    /// `kIOHIDDigitizerTransducerTypeFinger`.
    private static let fingerTransducer: UInt32 = 2
    /// Pause after each service-creation message, so the guest registers it first. On a
    /// freshly booted simulator a touch sent 20 ms after the services were created was
    /// dropped, so this is generous; it is paid once per helper.
    private static let warmUpPauseMicros: UInt32 = 100_000

    private let functions: IndigoFunctions
    private let client: HIDClient
    private let pointSize: CGSize
    private var warmedUp = false

    init(functions: IndigoFunctions, client: HIDClient, pointSize: CGSize) {
        self.functions = functions
        self.client = client
        self.pointSize = pointSize
    }

    /// `point` is in device points (already clamped).
    func touch(_ phase: TouchPhase, at point: CGPoint, id: UInt32) throws {
        try warmUp()
        let normalized = CGPoint(x: point.x / pointSize.width, y: point.y / pointSize.height)
        guard let event = makeDigitizerEvent(at: normalized, id: id, phase: phase) else {
            throw HelperError.frameworkUnavailable("IOHIDEventCreateDigitizerEvent returned no event")
        }
        let message = withExtendedLifetime(event) {
            functions.trackpadWrap(Unmanaged.passUnretained(event as AnyObject).toOpaque())
        }
        if let message { DigitizerMessage.patch(message, size: malloc_size(message)) }
        try client.send(message, "IndigoHIDMessageForTrackpadEventFromHIDEventRef")
    }

    /// Creates the pointer and mouse services (once).
    func warmUp() throws {
        guard !warmedUp else { return }
        try client.send(functions.createPointerService(), "IndigoHIDMessageToCreatePointerService")
        usleep(Self.warmUpPauseMicros)
        try client.send(functions.createMouseService(), "IndigoHIDMessageToCreateMouseService")
        usleep(Self.warmUpPauseMicros)
        warmedUp = true
    }

    /// Digitizer parent + finger child. Down and move carry Range|Touch|Position (0x07)
    /// with range and touch on; up carries Touch|Position (0x06) with both off.
    private func makeDigitizerEvent(at point: CGPoint, id: UInt32, phase: TouchPhase) -> CFTypeRef? {
        let mask: UInt32 = phase == .up ? 0x06 : 0x07
        let inContact = phase != .up
        let now = mach_absolute_time()
        guard let parent = functions.createDigitizer(
            nil, now, Self.fingerTransducer, 0, id, mask, 0,
            point.x, point.y, 0, 0, 0, inContact, inContact, 0)?.takeRetainedValue()
        else { return nil }
        guard let finger = functions.createFinger(
            nil, now, 0, id, mask, point.x, point.y, 0, 0, 0, inContact, inContact, 0)?.takeRetainedValue()
        else { return nil }
        functions.appendEvent(parent, finger, 0)
        return parent
    }
}
