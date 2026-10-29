import Foundation

/// Frame type bytes on the helper's stdout. Layout: [u8 type][u32 length BE][payload].
public enum FrameType: UInt8, Sendable {
    case hello = 0x01
    case videoConfig = 0x02
    case videoFrame = 0x03
    case event = 0x04
}

public struct DeviceInfo: Codable, Equatable, Sendable {
    public var name: String
    public var pointWidth: Double
    public var pointHeight: Double
    public var scale: Double

    public init(name: String, pointWidth: Double, pointHeight: Double, scale: Double) {
        self.name = name
        self.pointWidth = pointWidth
        self.pointHeight = pointHeight
        self.scale = scale
    }
}

public struct Hello: Codable, Equatable, Sendable {
    public var `protocol`: Int
    public var xcodeVersion: String
    public var device: DeviceInfo
    public var capabilities: [String]

    public init(protocol: Int, xcodeVersion: String, device: DeviceInfo, capabilities: [String]) {
        self.protocol = `protocol`
        self.xcodeVersion = xcodeVersion
        self.device = device
        self.capabilities = capabilities
    }
}
