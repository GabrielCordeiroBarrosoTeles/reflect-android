import CoreGraphics
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

func intArg(_ name: String, default value: Int) -> Int {
    argValue(name).flatMap { Int($0) } ?? value
}

let initialSettings = EncoderSettings(
    fps: intArg("--fps", default: 60),
    bitrate: intArg("--bitrate", default: 8_000_000),
    maxSize: intArg("--max-size", default: 1920))

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
@Sendable func send(_ write: () throws -> Void) {
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
let resolver: DynamicFrameworkResolver
let located: LocatedDevice
let capabilities: [String]
do {
    environment = try XcodeEnvironment.load(runner: ProcessCommandRunner())
    resolver = try DynamicFrameworkResolver(developerDir: environment.developerDir)
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

let screen = SimulatorScreenSource(device: located.device, log: log)
let encoder = H264Encoder(
    settings: initialSettings,
    sink: writer,
    onOutputClosed: {
        // The parent is gone (R7): stop capturing and exit cleanly.
        log("stdout closed, exiting")
        screen.stop()
        exit(0)
    },
    log: log)
encoder.start()
do {
    try screen.start { surface in encoder.submit(surface) }
} catch let error as HelperError {
    fail(error)
} catch {
    fail(.frameworkUnavailable("\(error)"))
}

func shutDown() -> Never {
    screen.stop()
    encoder.stop()
    exit(0)
}

@Sendable func warn(_ message: String) {
    send { try writer.writeEvent(type: "warning", message: message) }
}

// Input runs on the main queue: the Indigo HID builders read AppKit thread state.
let input = SimulatorInput(
    device: located.device,
    udid: udid,
    resolver: resolver,
    pointSize: CGSize(width: located.info.pointWidth, height: located.info.pointHeight),
    runner: ProcessCommandRunner(),
    onError: { error in send { try writer.writeError(error) } },
    onWarning: { message in warn(message) },
    onOrientation: { orientation in send { try writer.writeOrientationChanged(orientation) } },
    log: log)
let dispatcher = InputDispatcher(
    sink: input,
    pointSize: CGSize(width: located.info.pointWidth, height: located.info.pointHeight),
    onWarning: { message in warn(message) })

/// Reads stdin on a background thread so the main queue stays free for input. `stop` and
/// EOF shut down on the main queue, after the input already queued there.
@Sendable func readCommands() {
    while let line = readLine() {
        switch CommandReader.parse(line: line) {
        case .command(.stop):
            DispatchQueue.main.async { shutDown() }
            return
        case .command(.keyframe):
            encoder.requestKeyframe()
        case .command(.quality(let bitrate, let fps, let maxSize)):
            encoder.update(EncoderSettings(fps: fps, bitrate: bitrate, maxSize: maxSize))
        case .command(.simulatorApp(let action)):
            DispatchQueue.main.async { SimulatorAppWindow.apply(action) }
        case .command(let command):
            DispatchQueue.main.async { dispatcher.dispatch(command) }
        case .unknown(let type):
            warn("unknown command \(type)")
        case .invalid:
            warn("invalid command")
        }
    }
    DispatchQueue.main.async { shutDown() }
}

DispatchQueue.main.async { input.prepare() }
Thread { readCommands() }.start()
dispatchMain()
