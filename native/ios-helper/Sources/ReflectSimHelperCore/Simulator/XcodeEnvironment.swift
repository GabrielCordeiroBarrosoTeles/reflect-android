import Foundation

/// Runs a command and returns its stdout. Throws when it cannot be run or exits non-zero.
public protocol CommandRunning {
    func run(_ executable: String, _ arguments: [String]) throws -> String
}

public struct CommandFailed: Error, Equatable {
    public let command: String
    public let status: Int32
}

/// `Process`-backed runner. stderr is discarded.
public struct ProcessCommandRunner: CommandRunning {
    public init() {}

    public func run(_ executable: String, _ arguments: [String]) throws -> String {
        let process = Process()
        let stdout = Pipe()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.standardOutput = stdout
        process.standardError = FileHandle.nullDevice
        process.standardInput = FileHandle.nullDevice
        try process.run()
        let data = stdout.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        guard process.terminationStatus == 0 else {
            throw CommandFailed(command: executable, status: process.terminationStatus)
        }
        return String(decoding: data, as: UTF8.self)
    }
}

/// The active Xcode: developer dir (`xcode-select -p`) and version (`xcodebuild -version`).
public struct XcodeEnvironment: Equatable, Sendable {
    public static let minimumMajorVersion = 26

    public let developerDir: String
    public let version: String

    public init(developerDir: String, version: String) {
        self.developerDir = developerDir
        self.version = version
    }

    public static func load(runner: CommandRunning) throws -> XcodeEnvironment {
        guard let selectOutput = try? runner.run("/usr/bin/xcode-select", ["-p"]) else {
            throw HelperError.xcodeUnsupported("Xcode not found (xcode-select -p failed)")
        }
        guard let versionOutput = try? runner.run("/usr/bin/xcodebuild", ["-version"]) else {
            throw HelperError.xcodeUnsupported("cannot read the Xcode version (xcodebuild -version failed)")
        }
        let firstLine = versionOutput.split(separator: "\n").first.map(String.init) ?? ""
        let version = try parseVersion(firstLine)
        let major = Int(version.split(separator: ".").first ?? "") ?? 0
        guard major >= minimumMajorVersion else {
            throw HelperError.xcodeUnsupported(
                "Xcode \(version) is not supported (needs \(minimumMajorVersion) or newer)")
        }
        return XcodeEnvironment(
            developerDir: selectOutput.trimmingCharacters(in: .whitespacesAndNewlines),
            version: version)
    }

    /// `"Xcode 26.6"` → `"26.6"`.
    private static func parseVersion(_ line: String) throws -> String {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let prefix = "Xcode "
        let version = trimmed.hasPrefix(prefix) ? String(trimmed.dropFirst(prefix.count)) : ""
        guard let first = version.first, first.isNumber else {
            throw HelperError.xcodeUnsupported("cannot read the Xcode version from \"\(trimmed)\"")
        }
        return version
    }
}
