import Foundation
import ReflectSimHelperCore

func argValue(_ name: String) -> String? {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

guard argValue("--udid") != nil else {
    FileHandle.standardError.write(Data("reflect-sim-helper: missing required --udid <UDID>\n".utf8))
    exit(64)
}

let writer = FrameWriter.stdout()
try writer.writeHello(Hello(
    protocol: 1,
    xcodeVersion: "",
    device: DeviceInfo(name: "", pointWidth: 0, pointHeight: 0, scale: 0),
    capabilities: []))

while let line = readLine() {
    switch CommandReader.parse(line: line) {
    case .command(.stop):
        exit(0)
    case .command:
        break
    case .unknown(let type):
        try writer.writeEvent(type: "warning", message: "unknown command \(type)")
    case .invalid:
        try writer.writeEvent(type: "warning", message: "invalid command")
    }
}
exit(0)
