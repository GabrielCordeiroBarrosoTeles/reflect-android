import Foundation

/// Looks up private classes and C symbols. Production: `DynamicFrameworkResolver`.
public protocol SymbolResolving {
    func symbol(_ name: String, in framework: String) -> UnsafeMutableRawPointer?
    func hasClass(_ name: String) -> Bool
}

/// Framework keys understood by `SymbolResolving.symbol(_:in:)`.
public enum PrivateFramework {
    public static let coreSimulator = "CoreSimulator"
    public static let simulatorKit = "SimulatorKit"
    public static let ioKit = "IOKit"
}

public enum ProbeResult: Equatable, Sendable {
    case supported(capabilities: [String])
    case unsupported(missing: [String])
}

/// Checks, before touching anything, that every private class and symbol the helper
/// needs is present, so a missing piece becomes a structured error instead of a crash.
public enum CompatibilityProbe {
    public static let requiredClasses = ["SimServiceContext", "SimulatorKit.SimDeviceLegacyHIDClient"]

    public static let requiredSymbols: [(name: String, framework: String)] = [
        ("IndigoHIDMessageForTrackpadEventFromHIDEventRef", PrivateFramework.simulatorKit),
        ("IndigoHIDMessageForButton", PrivateFramework.simulatorKit),
        ("IndigoHIDMessageToCreatePointerService", PrivateFramework.simulatorKit),
        ("IndigoHIDMessageToCreateMouseService", PrivateFramework.simulatorKit),
        ("IndigoHIDMessageForHIDArbitrary", PrivateFramework.simulatorKit),
        ("IOHIDEventCreateDigitizerEvent", PrivateFramework.ioKit),
        ("IOHIDEventCreateDigitizerFingerEvent", PrivateFramework.ioKit),
        ("IOHIDEventAppendEvent", PrivateFramework.ioKit),
    ]

    public static let capabilities = ["video", "touch", "buttons", "keyboard", "orientation", "simulatorApp"]

    public static func run(resolver: SymbolResolving) -> ProbeResult {
        let missingClasses = requiredClasses.filter { !resolver.hasClass($0) }
        let missingSymbols = requiredSymbols
            .filter { resolver.symbol($0.name, in: $0.framework) == nil }
            .map(\.name)
        let missing = missingClasses + missingSymbols
        return missing.isEmpty ? .supported(capabilities: capabilities) : .unsupported(missing: missing)
    }
}

/// `dlopen`/`dlsym` resolver. Loading CoreSimulator also registers its ObjC classes.
/// Handles are kept for the process lifetime (never `dlclose`d).
public final class DynamicFrameworkResolver: SymbolResolving {
    private let handles: [String: UnsafeMutableRawPointer]

    public init(developerDir: String) throws {
        let paths = [
            PrivateFramework.coreSimulator:
                "/Library/Developer/PrivateFrameworks/CoreSimulator.framework/CoreSimulator",
            PrivateFramework.simulatorKit:
                developerDir + "/Library/PrivateFrameworks/SimulatorKit.framework/SimulatorKit",
            PrivateFramework.ioKit: "/System/Library/Frameworks/IOKit.framework/IOKit",
        ]
        var handles: [String: UnsafeMutableRawPointer] = [:]
        // CoreSimulator first: SimulatorKit links against it.
        for key in [PrivateFramework.coreSimulator, PrivateFramework.simulatorKit, PrivateFramework.ioKit] {
            let path = paths[key]!
            guard let handle = dlopen(path, RTLD_NOW | RTLD_GLOBAL) else {
                let reason = dlerror().map { String(cString: $0) } ?? "unknown error"
                throw HelperError.frameworkUnavailable("cannot load \(key) (\(path)): \(reason)")
            }
            handles[key] = handle
        }
        self.handles = handles
    }

    public func symbol(_ name: String, in framework: String) -> UnsafeMutableRawPointer? {
        handles[framework].flatMap { dlsym($0, name) }
    }

    public func hasClass(_ name: String) -> Bool {
        NSClassFromString(name) != nil
    }
}
