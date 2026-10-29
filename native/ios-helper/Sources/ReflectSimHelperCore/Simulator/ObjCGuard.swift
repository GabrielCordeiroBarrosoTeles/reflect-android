import CObjCGuard
import Foundation

/// An Objective-C exception caught by `ObjCGuard`. `reason` is "Name: reason".
public struct ObjCException: Error, Equatable {
    public let reason: String
}

/// Swift-facing wrapper over `RSHTry` (CObjCGuard): runs `body` and turns an Objective-C
/// exception into a thrown `ObjCException` instead of aborting the process.
/// `body` must not throw Swift errors (they cannot cross the Objective-C block); return a
/// value and validate it after the call.
public enum ObjCGuard {
    public static func run<T>(_ body: () -> T) throws -> T {
        var result: T?
        if let reason = RSHTry({ result = body() }) {
            throw ObjCException(reason: reason)
        }
        return result!
    }

    /// Like `run`, but maps an exception to `HelperError.frameworkUnavailable("<what>: <reason>")`.
    static func call<T>(_ what: String, _ body: () -> T) throws -> T {
        do {
            return try run(body)
        } catch let error as ObjCException {
            throw HelperError.frameworkUnavailable("\(what) raised \(error.reason)")
        }
    }
}
