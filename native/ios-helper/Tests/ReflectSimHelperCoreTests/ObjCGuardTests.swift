import Foundation
import Testing
@testable import ReflectSimHelperCore

@Suite struct ObjCGuardTests {
    @Test func returnsTheBlockValue() throws {
        #expect(try ObjCGuard.run { 42 } == 42)
    }

    @Test func catchesAnNSExceptionAndReturnsItsReason() {
        #expect(throws: ObjCException(reason: "NSInvalidArgumentException: proxy went away")) {
            try ObjCGuard.run {
                NSException(name: .invalidArgumentException, reason: "proxy went away").raise()
            }
        }
    }

    @Test func callMapsTheExceptionToFrameworkUnavailable() {
        #expect(throws: HelperError.frameworkUnavailable(
            "SimDevice.stateString raised NSGenericException: boom")) {
            try ObjCGuard.call("SimDevice.stateString") {
                NSException(name: .genericException, reason: "boom").raise()
            }
        }
    }
}
