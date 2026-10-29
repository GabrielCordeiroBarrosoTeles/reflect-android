import Foundation
import IOSurface

/// Delivers the simulator's framebuffer whenever SimulatorKit composites a new frame.
/// `onFrame` is called on the source's serial callback queue.
public protocol ScreenSource: AnyObject {
    func start(onFrame: @escaping (IOSurface) -> Void) throws
    func stop()
}

// Typed views of the CoreSimulator I/O objects (all ROCK proxies: direct sends, no KVC;
// see ObjCRuntime.swift). Checked against Xcode 26.6.

@objc protocol SimDeviceWithIO {
    @objc var io: AnyObject? { get }
}

@objc protocol SimDeviceIOClient {
    @objc var ioPorts: NSArray { get }
}

@objc protocol SimDeviceIOPort {
    @objc var portIdentifier: AnyObject? { get }
    @objc var descriptor: AnyObject? { get }
}

@objc protocol SimDisplayDescriptor {
    @objc var framebufferSurface: AnyObject? { get }

    @objc(registerScreenCallbacksWithUUID:callbackQueue:frameCallback:surfacesChangedCallback:propertiesChangedCallback:)
    func registerScreenCallbacks(
        uuid: NSUUID,
        callbackQueue: DispatchQueue,
        frameCallback: @escaping @convention(block) () -> Void,
        surfacesChangedCallback: @escaping @convention(block) () -> Void,
        propertiesChangedCallback: @escaping @convention(block) () -> Void)

    @objc(unregisterScreenCallbacksWithUUID:)
    func unregisterScreenCallbacks(uuid: NSUUID)
}

/// Production `ScreenSource` over SimulatorKit's display descriptor (spec §4.2, §4.4, §4.5).
///
/// Finds the `com.apple.framebuffer.display` port whose `descriptor` answers
/// `framebufferSurface` (largest surface wins: a secondary display port has none), retains
/// the descriptor for the whole session and registers screen callbacks on it. Registering a
/// consumer is what makes the simulator composite frames at all; the frame callback then
/// drives capture. Adapted from luispadron/baguette `SimulatorKitScreen.swift` (Apache-2.0).
public final class SimulatorScreenSource: ScreenSource, @unchecked Sendable {
    static let displayPort = "com.apple.framebuffer.display"
    static let descriptorSelectors = [
        "framebufferSurface",
        "registerScreenCallbacksWithUUID:callbackQueue:frameCallback:surfacesChangedCallback:propertiesChangedCallback:",
        "unregisterScreenCallbacksWithUUID:",
    ]

    private let device: NSObject
    private let queue = DispatchQueue(label: "reflect.screen", qos: .userInteractive)
    private let log: (String) -> Void

    // Touched only on `queue` after start (start/stop run before/after callbacks can fire).
    private var descriptor: NSObject?
    private var callbackID: NSUUID?
    private var surface: IOSurface?
    private var onFrame: ((IOSurface) -> Void)?

    public init(device: NSObject, log: @escaping (String) -> Void = { _ in }) {
        self.device = device
        self.log = log
    }

    public func start(onFrame: @escaping (IOSurface) -> Void) throws {
        let (descriptor, surface) = try findDisplay()
        let id = NSUUID()
        queue.sync {
            self.descriptor = descriptor
            self.callbackID = id
            self.surface = surface
            self.onFrame = onFrame
        }
        let frame: @convention(block) () -> Void = { [weak self] in self?.frameArrived(surfacesChanged: false) }
        let surfaces: @convention(block) () -> Void = { [weak self] in self?.frameArrived(surfacesChanged: true) }
        let properties: @convention(block) () -> Void = {}
        let queue = queue
        try ObjCGuard.call("SimDisplayDescriptor.registerScreenCallbacks") {
            ObjC.as(descriptor, SimDisplayDescriptor.self).registerScreenCallbacks(
                uuid: id, callbackQueue: queue,
                frameCallback: frame, surfacesChangedCallback: surfaces, propertiesChangedCallback: properties)
        }
        // Prime the pipeline with the current contents; a static screen sends no callbacks.
        queue.async { [weak self] in self?.frameArrived(surfacesChanged: false) }
    }

    /// Unregisters and releases the descriptor. Must not be called from the callback queue.
    public func stop() {
        let (descriptor, id) = queue.sync { () -> (NSObject?, NSUUID?) in
            defer {
                self.descriptor = nil
                self.callbackID = nil
                self.surface = nil
                self.onFrame = nil
            }
            return (self.descriptor, self.callbackID)
        }
        guard let descriptor, let id else { return }
        do {
            try ObjCGuard.call("SimDisplayDescriptor.unregisterScreenCallbacks") {
                ObjC.as(descriptor, SimDisplayDescriptor.self).unregisterScreenCallbacks(uuid: id)
            }
        } catch {
            log("could not unregister screen callbacks: \(error)")
        }
    }

    /// On `queue`. The surface is cached and only re-read when SimulatorKit says the surfaces
    /// changed (rotation, resize), to keep proxy round-trips off the per-frame path.
    private func frameArrived(surfacesChanged: Bool) {
        guard let onFrame, let descriptor else { return }
        if surfacesChanged || surface == nil {
            surface = try? Self.surface(of: descriptor)
        }
        if let surface { onFrame(surface) }
    }

    private func findDisplay() throws -> (NSObject, IOSurface) {
        let hasIO = try ObjCGuard.call("SimDevice.respondsToSelector:") { ObjC.responds(device, to: ["io"]) }
        guard hasIO, let io = try ObjCGuard.call("SimDevice.io", { ObjC.as(device, SimDeviceWithIO.self).io }),
              try ObjCGuard.call("SimDeviceIOClient.respondsToSelector:", { ObjC.responds(io, to: ["ioPorts"]) })
        else { throw HelperError.frameworkUnavailable("SimDevice has no I/O client") }

        let ports = try ObjCGuard.call("SimDeviceIOClient.ioPorts") {
            (ObjC.as(io, SimDeviceIOClient.self).ioPorts as? [NSObject]) ?? []
        }
        var best: (descriptor: NSObject, surface: IOSurface)?
        for port in ports {
            guard let descriptor = try displayDescriptor(of: port),
                  let surface = try Self.surface(of: descriptor)
            else { continue }
            let area = IOSurfaceGetWidth(surface) * IOSurfaceGetHeight(surface)
            if area > (best.map { IOSurfaceGetWidth($0.surface) * IOSurfaceGetHeight($0.surface) } ?? 0) {
                best = (descriptor, surface)
            }
        }
        guard let best else { throw HelperError.frameworkUnavailable("the simulator exposes no framebuffer display") }
        return best
    }

    private func displayDescriptor(of port: NSObject) throws -> NSObject? {
        try ObjCGuard.call("SimDeviceIOPort.descriptor") { () -> NSObject? in
            guard ObjC.responds(port, to: ["portIdentifier", "descriptor"]) else { return nil }
            let typed = ObjC.as(port, SimDeviceIOPort.self)
            guard let identifier = typed.portIdentifier, "\(identifier)" == Self.displayPort,
                  let descriptor = typed.descriptor as? NSObject,
                  ObjC.responds(descriptor, to: Self.descriptorSelectors)
            else { return nil }
            return descriptor
        }
    }

    private static func surface(of descriptor: NSObject) throws -> IOSurface? {
        try ObjCGuard.call("SimDisplayDescriptor.framebufferSurface") {
            ObjC.as(descriptor, SimDisplayDescriptor.self).framebufferSurface as? IOSurface
        }
    }
}
