import Testing
@testable import ReflectSimHelperCore

struct FakeRunner: CommandRunning {
    var outputs: [String: String]

    func run(_ executable: String, _ arguments: [String]) throws -> String {
        let key = ([executable] + arguments).joined(separator: " ")
        guard let out = outputs[key] else { throw FakeRunnerError.failed(key) }
        return out
    }
}

enum FakeRunnerError: Error { case failed(String) }

@Suite struct XcodeEnvironmentTests {
    let selectKey = "/usr/bin/xcode-select -p"
    let versionKey = "/usr/bin/xcodebuild -version"

    @Test func readsDeveloperDirAndVersion() throws {
        let env = try XcodeEnvironment.load(runner: FakeRunner(outputs: [
            selectKey: "/Applications/Xcode.app/Contents/Developer\n",
            versionKey: "Xcode 26.6\nBuild version 17F113\n",
        ]))
        #expect(env.developerDir == "/Applications/Xcode.app/Contents/Developer")
        #expect(env.version == "26.6")
    }

    @Test func newerMajorVersionsAreSupported() throws {
        let env = try XcodeEnvironment.load(runner: FakeRunner(outputs: [
            selectKey: "/X\n", versionKey: "Xcode 27.0\n",
        ]))
        #expect(env.version == "27.0")
    }

    @Test func olderXcodeIsUnsupported() {
        #expect(throws: HelperError.xcodeUnsupported("Xcode 16.4 is not supported (needs 26 or newer)")) {
            try XcodeEnvironment.load(runner: FakeRunner(outputs: [
                selectKey: "/X\n", versionKey: "Xcode 16.4\nBuild version 16F6\n",
            ]))
        }
    }

    @Test func missingXcodeIsUnsupported() {
        #expect(throws: HelperError.xcodeUnsupported("Xcode not found (xcode-select -p failed)")) {
            try XcodeEnvironment.load(runner: FakeRunner(outputs: [:]))
        }
    }

    @Test func commandLineToolsOnlyIsUnsupported() {
        #expect(throws: HelperError.xcodeUnsupported("cannot read the Xcode version (xcodebuild -version failed)")) {
            try XcodeEnvironment.load(runner: FakeRunner(outputs: [selectKey: "/Library/Developer/CommandLineTools\n"]))
        }
    }

    @Test func unparseableVersionIsUnsupported() {
        #expect(throws: HelperError.xcodeUnsupported("cannot read the Xcode version from \"garbage\"")) {
            try XcodeEnvironment.load(runner: FakeRunner(outputs: [selectKey: "/X\n", versionKey: "garbage\n"]))
        }
    }
}

@Suite struct HelperErrorTests {
    @Test func codesMatchTheWireProtocol() {
        #expect(HelperError.xcodeUnsupported("x").code == "xcode-unsupported")
        #expect(HelperError.deviceNotFound(udid: "U").code == "device-not-found")
        #expect(HelperError.deviceNotBooted(state: "Shutdown").code == "device-not-booted")
        #expect(HelperError.frameworkUnavailable("f").code == "framework-unavailable")
    }

    @Test func messages() {
        #expect(HelperError.xcodeUnsupported("x").message == "x")
        #expect(HelperError.deviceNotFound(udid: "U").message == "no simulator with UDID U")
        #expect(HelperError.deviceNotBooted(state: "Shutdown").message == "simulator is not booted (state: Shutdown)")
        #expect(HelperError.frameworkUnavailable("f").message == "f")
    }
}

@Suite struct DeviceInfoTests {
    @Test func pointSizeComesFromPixelsAndScale() {
        #expect(SimulatorLocator.deviceInfo(name: "iPhone 15", pixelWidth: 1179, pixelHeight: 2556, scale: 3)
            == DeviceInfo(name: "iPhone 15", pointWidth: 393, pointHeight: 852, scale: 3))
    }

    @Test func zeroScaleFallsBackToPixels() {
        #expect(SimulatorLocator.deviceInfo(name: "X", pixelWidth: 100, pixelHeight: 200, scale: 0)
            == DeviceInfo(name: "X", pointWidth: 100, pointHeight: 200, scale: 1))
    }
}
