import Foundation

/// A booted simulator: the CoreSimulator `SimDevice` plus its screen geometry.
public struct LocatedDevice {
    public let device: NSObject
    public let info: DeviceInfo
}

/// Finds a simulator by UDID: `SimServiceContext` → default device set → `devices`.
/// Requires CoreSimulator to be loaded (see `DynamicFrameworkResolver`). Every private call
/// goes through `ObjCGuard.call`, so an Objective-C exception from a ROCK proxy becomes
/// `HelperError.frameworkUnavailable` instead of aborting the helper.
public struct SimulatorLocator {
    public let developerDir: String

    public init(developerDir: String) {
        self.developerDir = developerDir
    }

    public func device(udid: String) throws -> LocatedDevice {
        guard let wanted = UUID(uuidString: udid) else { throw HelperError.deviceNotFound(udid: udid) }
        var match: NSObject?
        for candidate in try allDevices() {
            let candidateUDID = try ObjCGuard.call("SimDevice.UDID") {
                ObjC.as(candidate, SimDevice.self).udid as UUID
            }
            if candidateUDID == wanted { match = candidate; break }
        }
        guard let match else { throw HelperError.deviceNotFound(udid: udid) }

        let device = ObjC.as(match, SimDevice.self)
        let state = try ObjCGuard.call("SimDevice.stateString") { device.stateString as String }
        guard state == "Booted" else { throw HelperError.deviceNotBooted(state: state) }

        let name = try ObjCGuard.call("SimDevice.name") { device.name as String }
        let deviceType = try ObjCGuard.call("SimDevice.deviceType") { device.deviceType }
        let screenSelectors = try ObjCGuard.call("SimDeviceType.respondsToSelector:") {
            ObjC.responds(deviceType, to: ["mainScreenSize", "mainScreenScale"])
        }
        guard screenSelectors else {
            throw HelperError.frameworkUnavailable("SimDeviceType does not expose its screen size")
        }
        let type = ObjC.as(deviceType, SimDeviceType.self)
        let pixels = try ObjCGuard.call("SimDeviceType.mainScreenSize") { type.mainScreenSize }
        let scale = try ObjCGuard.call("SimDeviceType.mainScreenScale") { type.mainScreenScale }
        let info = Self.deviceInfo(
            name: name, pixelWidth: pixels.width, pixelHeight: pixels.height, scale: Double(scale))
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
        let developerDir = developerDir
        let context = try ObjCGuard.call("SimServiceContext.sharedServiceContextForDeveloperDir:error:") {
            ObjC.as(contextClass, SimServiceContextClass.self)
                .sharedServiceContext(forDeveloperDir: developerDir, error: &error)
        }
        guard let context,
              try ObjCGuard.call("SimServiceContext.respondsToSelector:", {
                  ObjC.responds(context, to: ["defaultDeviceSetWithError:"])
              })
        else { throw HelperError.frameworkUnavailable("cannot open the CoreSimulator service: \(describe(error))") }

        let deviceSet = try ObjCGuard.call("SimServiceContext.defaultDeviceSetWithError:") {
            ObjC.as(context, SimServiceContext.self).defaultDeviceSet(error: &error)
        }
        guard let deviceSet,
              try ObjCGuard.call("SimDeviceSet.respondsToSelector:", { ObjC.responds(deviceSet, to: ["devices"]) })
        else { throw HelperError.frameworkUnavailable("cannot read the default device set: \(describe(error))") }

        let devices = try ObjCGuard.call("SimDeviceSet.devices") {
            (ObjC.as(deviceSet, SimDeviceSet.self).devices as? [NSObject]) ?? []
        }
        return try ObjCGuard.call("SimDevice.respondsToSelector:") {
            devices.filter { ObjC.responds($0, to: ["UDID", "name", "stateString", "deviceType"]) }
        }
    }

    private func describe(_ error: NSError?) -> String {
        error?.localizedDescription ?? "unknown error"
    }
}
