import CoreFoundation
import Foundation
import ObjectiveC

/// The SimulatorKit and IOKit C entry points used for input, resolved once at start-up.
/// Signatures adapted from luispadron/baguette `IndigoHIDInput.swift` and
/// `IOHIDDigitizerDispatch.swift` (Apache-2.0). Every builder returns a `malloc`ed Indigo
/// message (or nil); `HIDClient.send` hands it over with `freeWhenDone`.
struct IndigoFunctions {
    typealias ServiceFn = @convention(c) () -> UnsafeMutableRawPointer?
    /// `IndigoHIDMessageForButton(source, direction, target)`.
    typealias ButtonFn = @convention(c) (UInt32, UInt32, UInt32) -> UnsafeMutableRawPointer?
    /// `IndigoHIDMessageForHIDArbitrary(target, page, usage, operation)`.
    typealias HIDArbitraryFn = @convention(c) (UInt32, UInt32, UInt32, UInt32) -> UnsafeMutableRawPointer?
    /// `IndigoHIDMessageForTrackpadEventFromHIDEventRef(IOHIDEventRef)`.
    typealias TrackpadWrapFn = @convention(c) (UnsafeRawPointer) -> UnsafeMutableRawPointer?
    /// `IOHIDEventCreateDigitizerEvent(allocator, timestamp, transducer, index, identifier,
    /// eventMask, buttonMask, x, y, z, tipPressure, barrelPressure, range, touch, options)`.
    typealias CreateDigitizerFn = @convention(c) (
        CFAllocator?, UInt64, UInt32,
        UInt32, UInt32, UInt32, UInt32,
        Double, Double, Double, Double, Double,
        Bool, Bool, UInt32
    ) -> Unmanaged<CFTypeRef>?
    /// `IOHIDEventCreateDigitizerFingerEvent(allocator, timestamp, index, identifier,
    /// eventMask, x, y, z, tipPressure, twist, range, touch, options)`.
    typealias CreateFingerFn = @convention(c) (
        CFAllocator?, UInt64,
        UInt32, UInt32, UInt32,
        Double, Double, Double, Double, Double,
        Bool, Bool, UInt32
    ) -> Unmanaged<CFTypeRef>?
    /// `IOHIDEventAppendEvent(parent, child, options)`.
    typealias AppendEventFn = @convention(c) (CFTypeRef, CFTypeRef, UInt32) -> Void

    let createPointerService: ServiceFn
    let createMouseService: ServiceFn
    let button: ButtonFn
    let hidArbitrary: HIDArbitraryFn
    let trackpadWrap: TrackpadWrapFn
    let createDigitizer: CreateDigitizerFn
    let createFinger: CreateFingerFn
    let appendEvent: AppendEventFn

    init(resolver: SymbolResolving) throws {
        func resolve<T>(_ name: String, _ framework: String, as type: T.Type) throws -> T {
            guard let pointer = resolver.symbol(name, in: framework) else {
                throw HelperError.frameworkUnavailable("\(framework) does not export \(name)")
            }
            return unsafeBitCast(pointer, to: type)
        }
        let kit = PrivateFramework.simulatorKit, io = PrivateFramework.ioKit
        createPointerService = try resolve("IndigoHIDMessageToCreatePointerService", kit, as: ServiceFn.self)
        createMouseService = try resolve("IndigoHIDMessageToCreateMouseService", kit, as: ServiceFn.self)
        button = try resolve("IndigoHIDMessageForButton", kit, as: ButtonFn.self)
        hidArbitrary = try resolve("IndigoHIDMessageForHIDArbitrary", kit, as: HIDArbitraryFn.self)
        trackpadWrap = try resolve("IndigoHIDMessageForTrackpadEventFromHIDEventRef", kit, as: TrackpadWrapFn.self)
        createDigitizer = try resolve("IOHIDEventCreateDigitizerEvent", io, as: CreateDigitizerFn.self)
        createFinger = try resolve("IOHIDEventCreateDigitizerFingerEvent", io, as: CreateFingerFn.self)
        appendEvent = try resolve("IOHIDEventAppendEvent", io, as: AppendEventFn.self)
    }
}

@objc private protocol ObjCAllocating {
    func alloc() -> AnyObject
}

@objc private protocol SimDeviceLegacyHIDClient {
    @objc(initWithDevice:error:)
    func initWithDevice(_ device: AnyObject, error: AutoreleasingUnsafeMutablePointer<NSError?>?) -> AnyObject?

    @objc(sendWithMessage:freeWhenDone:completionQueue:completion:)
    func send(
        withMessage message: UnsafeMutableRawPointer,
        freeWhenDone: Bool,
        completionQueue: DispatchQueue?,
        completion: ((NSError?) -> Void)?)
}

/// SimulatorKit's `SimDeviceLegacyHIDClient`: the host end of the simulator's Indigo HID
/// mach port. Every message send goes through `ObjCGuard` (ruling R9).
final class HIDClient {
    static let className = "SimulatorKit.SimDeviceLegacyHIDClient"
    private static let initSelector = "initWithDevice:error:"
    private static let sendSelector = "sendWithMessage:freeWhenDone:completionQueue:completion:"

    private let client: AnyObject

    init(device: NSObject) throws {
        guard let cls = NSClassFromString(Self.className) else {
            throw HelperError.frameworkUnavailable("\(Self.className) is unavailable")
        }
        for selector in [Self.initSelector, Self.sendSelector]
        where !class_respondsToSelector(cls, NSSelectorFromString(selector)) {
            throw HelperError.frameworkUnavailable("\(Self.className) does not answer \(selector)")
        }
        var error: NSError?
        let created = try ObjCGuard.call("\(Self.className) \(Self.initSelector)") {
            let allocated = ObjC.as(cls as AnyObject, ObjCAllocating.self).alloc()
            return ObjC.as(allocated, SimDeviceLegacyHIDClient.self).initWithDevice(device, error: &error)
        }
        guard let created else {
            throw HelperError.frameworkUnavailable(
                "cannot connect to the simulator HID port: \(error?.localizedDescription ?? "unknown error")")
        }
        client = created
    }

    /// Sends a `malloc`ed Indigo message; the client frees it. A nil message (a builder
    /// that refused its input) is reported instead of sent.
    func send(_ message: UnsafeMutableRawPointer?, _ what: String) throws {
        guard let message else {
            throw HelperError.frameworkUnavailable("\(what) returned no message")
        }
        let client = client
        try ObjCGuard.call("\(Self.className) \(Self.sendSelector)") {
            ObjC.as(client, SimDeviceLegacyHIDClient.self)
                .send(withMessage: message, freeWhenDone: true, completionQueue: nil, completion: nil)
        }
    }
}
