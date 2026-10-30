import CoreVideo
import Foundation
import IOSurface
import Testing
@testable import ReflectSimHelperCore

@Suite struct SurfaceChangeTrackerTests {
    func makeSurface() throws -> IOSurface {
        let properties: [IOSurfacePropertyKey: Any] = [
            .width: 2, .height: 2, .bytesPerElement: 4, .bytesPerRow: 64,
            .pixelFormat: kCVPixelFormatType_32BGRA,
        ]
        return try #require(IOSurface(properties: properties))
    }

    func draw(_ surface: IOSurface) {
        surface.lock(options: [], seed: nil)
        surface.baseAddress.assumingMemoryBound(to: UInt8.self)[0] &+= 1
        surface.unlock(options: [], seed: nil)
    }

    @Test func reportsTheFirstLookAsAChange() throws {
        var tracker = SurfaceChangeTracker()
        let first = tracker.hasChanged(try makeSurface())
        #expect(first)
    }

    @Test func ignoresAnUntouchedSurface() throws {
        var tracker = SurfaceChangeTracker()
        let surface = try makeSurface()
        _ = tracker.hasChanged(surface)
        let again = tracker.hasChanged(surface)
        #expect(!again)
    }

    @Test func reportsAChangeAfterTheSurfaceIsDrawn() throws {
        var tracker = SurfaceChangeTracker()
        let surface = try makeSurface()
        _ = tracker.hasChanged(surface)
        draw(surface)
        let afterDraw = tracker.hasChanged(surface)
        let afterSecondLook = tracker.hasChanged(surface)
        #expect(afterDraw)
        #expect(!afterSecondLook)
    }

    @Test func reportsAChangeWhenTheSurfaceIsReplaced() throws {
        var tracker = SurfaceChangeTracker()
        let original = try makeSurface()
        _ = tracker.hasChanged(original)
        let replacement = try makeSurface()
        let replaced = tracker.hasChanged(replacement)
        #expect(replaced)
        withExtendedLifetime(original) {}
    }
}
