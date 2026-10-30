import Testing
@testable import ReflectSimHelperCore

/// Resolver that reports everything present except the listed names.
struct FakeResolver: SymbolResolving {
    var missing: Set<String> = []

    func symbol(_ name: String, in framework: String) -> UnsafeMutableRawPointer? {
        missing.contains(name) ? nil : UnsafeMutableRawPointer(bitPattern: 0x1000)
    }

    func hasClass(_ name: String) -> Bool { !missing.contains(name) }
}

@Suite struct CompatibilityProbeTests {
    @Test func allPresentIsSupportedWithEveryCapability() {
        #expect(CompatibilityProbe.run(resolver: FakeResolver()) == .supported(
            capabilities: ["video", "touch", "buttons", "keyboard", "orientation", "simulatorApp"]))
    }

    @Test func missingTrackpadWrapperIsUnsupported() {
        let resolver = FakeResolver(missing: ["IndigoHIDMessageForTrackpadEventFromHIDEventRef"])
        #expect(CompatibilityProbe.run(resolver: resolver) == .unsupported(
            missing: ["IndigoHIDMessageForTrackpadEventFromHIDEventRef"]))
    }

    @Test func missingClassesAndSymbolsAreAllReportedInOrder() {
        let resolver = FakeResolver(missing: [
            "IOHIDEventAppendEvent", "SimulatorKit.SimDeviceLegacyHIDClient", "SimServiceContext",
        ])
        #expect(CompatibilityProbe.run(resolver: resolver) == .unsupported(
            missing: ["SimServiceContext", "SimulatorKit.SimDeviceLegacyHIDClient", "IOHIDEventAppendEvent"]))
    }
}
