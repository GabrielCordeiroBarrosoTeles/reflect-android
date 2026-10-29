import Foundation
import ReflectSimHelperCore

func argValue(_ name: String) -> String? {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

/// Writes a line to stderr. Uses the throwing API and ignores failure: the legacy
/// `write(_:)` raises an Objective-C exception on EPIPE when the parent closed stderr.
func log(_ message: String) {
    try? FileHandle.standardError.write(contentsOf: Data("reflect-sim-helper: \(message)\n".utf8))
}

guard let udid = argValue("--udid") else {
    log("missing required --udid <UDID>")
    exit(64)
}

// The parent closing our stdout must not kill us with SIGPIPE: the write fails instead,
// FrameWriter surfaces it and we exit cleanly (ruling R7).
signal(SIGPIPE, SIG_IGN)

let writer = FrameWriter.stdout()

// Last resort for an Objective-C exception that escaped ObjCGuard: report it as a
// structured `framework-unavailable` error and exit 2 instead of a bare abort.
NSSetUncaughtExceptionHandler { exception in
    let error = HelperError.frameworkUnavailable(
        "uncaught Objective-C exception \(exception.name.rawValue): \(exception.reason ?? "(no reason)")")
    try? FileHandle.standardError.write(
        contentsOf: Data("reflect-sim-helper: \(error.code): \(error.message)\n".utf8))
    try? FrameWriter.stdout().writeError(error)
    exit(HelperError.exitCode)
}

/// Runs a write; if stdout is gone the parent is gone, so exit 0.
func send(_ write: () throws -> Void) {
    do {
        try write()
    } catch {
        log("stdout closed, exiting")
        exit(0)
    }
}

/// Reports a fatal start-up error as an `error` event and exits 2.
func fail(_ error: HelperError) -> Never {
    log("\(error.code): \(error.message)")
    send { try writer.writeError(error) }
    exit(HelperError.exitCode)
}

let environment: XcodeEnvironment
let located: LocatedDevice
let capabilities: [String]
do {
    environment = try XcodeEnvironment.load(runner: ProcessCommandRunner())
    let resolver = try DynamicFrameworkResolver(developerDir: environment.developerDir)
    switch CompatibilityProbe.run(resolver: resolver) {
    case .supported(let found):
        capabilities = found
    case .unsupported(let missing):
        throw HelperError.xcodeUnsupported(
            "Xcode \(environment.version) is missing private APIs: \(missing.joined(separator: ", "))")
    }
    located = try SimulatorLocator(developerDir: environment.developerDir).device(udid: udid)
} catch let error as HelperError {
    fail(error)
} catch {
    fail(.frameworkUnavailable("\(error)"))
}

log("Xcode \(environment.version), \(located.info.name) \(located.info.pointWidth)x\(located.info.pointHeight) pt @\(located.info.scale)x")
send {
    try writer.writeHello(Hello(
        protocol: 1,
        xcodeVersion: environment.version,
        device: located.info,
        capabilities: capabilities))
}

while let line = readLine() {
    switch CommandReader.parse(line: line) {
    case .command(.stop):
        exit(0)
    case .command:
        break
    case .unknown(let type):
        send { try writer.writeEvent(type: "warning", message: "unknown command \(type)") }
    case .invalid:
        send { try writer.writeEvent(type: "warning", message: "invalid command") }
    }
}
exit(0)
