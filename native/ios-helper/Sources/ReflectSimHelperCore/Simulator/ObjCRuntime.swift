import CoreGraphics
import Foundation

// Typed views of private CoreSimulator objects. CoreSimulator objects may be remote (ROCK)
// proxies on which KVC fails (spec §4.4), so every call is a direct message send through
// one of these @objc protocols. The objects never formally conform; `ObjC.as` reinterprets
// the reference so Swift emits a plain objc_msgSend. Selector names and types were checked
// against the runtime type encodings on Xcode 26.6 (e.g. `mainScreenScale` is a float).

@objc protocol SimServiceContextClass {
    @objc(sharedServiceContextForDeveloperDir:error:)
    func sharedServiceContext(
        forDeveloperDir developerDir: String,
        error: AutoreleasingUnsafeMutablePointer<NSError?>?) -> AnyObject?
}

@objc protocol SimServiceContext {
    @objc(defaultDeviceSetWithError:)
    func defaultDeviceSet(error: AutoreleasingUnsafeMutablePointer<NSError?>?) -> AnyObject?
}

@objc protocol SimDeviceSet {
    @objc var devices: NSArray { get }
}

@objc protocol SimDevice {
    @objc(UDID) var udid: NSUUID { get }
    @objc var name: NSString { get }
    @objc var stateString: NSString { get }
    @objc var deviceType: AnyObject { get }
}

@objc protocol SimDeviceType {
    @objc var mainScreenSize: CGSize { get }
    @objc var mainScreenScale: Float { get }
}

enum ObjC {
    /// Reinterprets `object` as the @objc protocol type `T` (no conformance check).
    static func `as`<T>(_ object: AnyObject, _ type: T.Type) -> T {
        unsafeBitCast(object, to: type)
    }

    /// True when `object` answers every selector, so a missing private method becomes an
    /// error instead of an unrecognised-selector crash.
    static func responds(_ object: AnyObject, to selectors: [String]) -> Bool {
        selectors.allSatisfy { object.responds(to: NSSelectorFromString($0)) }
    }
}
