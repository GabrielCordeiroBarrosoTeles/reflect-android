import Foundation
import Testing
@testable import ReflectSimHelperCore

@Suite struct SimulatorAppWindowTests {
    @Test func keepsBootedDevicesRunningWhenSimulatorQuits() throws {
        let suite = "reflect.tests.simulator.\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        #expect(defaults.object(forKey: SimulatorAppWindow.detachOnQuitKey) == nil)
        SimulatorAppWindow.keepDevicesRunningOnQuit(defaults)
        #expect(defaults.bool(forKey: SimulatorAppWindow.detachOnQuitKey))
    }
}
