import Foundation

/// A booted simulator: the CoreSimulator `SimDevice` plus its screen geometry.
public struct LocatedDevice {
    public let device: NSObject
    public let info: DeviceInfo
}

/// Finds a simulator by UDID: `SimServiceContext` → default device set → `devices`.
/// Requires CoreSimulator to be loaded (see `DynamicFrameworkResolver`).
public struct SimulatorLocator {
    public let developerDir: String

    public init(developerDir: String) {
        self.developerDir = developerDir
    }

    public func device(udid: String) throws -> LocatedDevice {
        let devices = try allDevices()
        let wanted = UUID(uuidString: udid)
        guard let wanted,
              let match = devices.first(where: { ObjC.as($0, SimDevice.self).udid as UUID == wanted })
        else { throw HelperError.deviceNotFound(udid: udid) }

        let device = ObjC.as(match, SimDevice.self)
        let state = device.stateString as String
        guard state == "Booted" else { throw HelperError.deviceNotBooted(state: state) }

        let deviceType = device.deviceType
        guard ObjC.responds(deviceType, to: ["mainScreenSize", "mainScreenScale"]) else {
            throw HelperError.frameworkUnavailable("SimDeviceType does not expose its screen size")
        }
        let type = ObjC.as(deviceType, SimDeviceType.self)
        let pixels = type.mainScreenSize
        let info = Self.deviceInfo(
            name: device.name as String, pixelWidth: pixels.width, pixelHeight: pixels.height,
            scale: Double(type.mainScreenScale))
        return LocatedDevice(device: match, info: info)
    }

    /// Point size from the device type's pixel size and scale (iPhone 15: 1179×2556 @3 → 393×852).
    public static func deviceInfo(name: String, pixelWidth: Double, pixelHeight: Double, scale: Double) -> DeviceInfo {
        let scale = scale > 0 ? scale : 1
        return DeviceInfo(name: name, pointWidth: pixelWidth / scale, pointHeight: pixelHeight / scale, scale: scale)
    }

    private func allDevices() throws -> [NSObject] {
        guard let contextClass = NSClassFromString("SimServiceContext"),
              ObjC.responds(contextClass, to: ["sharedServiceContextForDeveloperDir:error:"])
        else { throw HelperError.frameworkUnavailable("SimServiceContext is unavailable") }

        var error: NSError?
        guard let context = ObjC.as(contextClass, SimServiceContextClass.self)
            .sharedServiceContext(forDeveloperDir: developerDir, error: &error),
            ObjC.responds(context, to: ["defaultDeviceSetWithError:"])
        else { throw HelperError.frameworkUnavailable("cannot open the CoreSimulator service: \(describe(error))") }

        guard let deviceSet = ObjC.as(context, SimServiceContext.self).defaultDeviceSet(error: &error),
              ObjC.responds(deviceSet, to: ["devices"])
        else { throw HelperError.frameworkUnavailable("cannot read the default device set: \(describe(error))") }

        let devices = (ObjC.as(deviceSet, SimDeviceSet.self).devices as? [NSObject]) ?? []
        return devices.filter { ObjC.responds($0, to: ["UDID", "name", "stateString", "deviceType"]) }
    }

    private func describe(_ error: NSError?) -> String {
        error?.localizedDescription ?? "unknown error"
    }
}
