import CoreVideo
import Foundation
import IOSurface
import Testing
@testable import ReflectSimHelperCore

@Suite struct FrameCopierTests {
    /// A 3×2 BGRA surface with a padded stride and a distinct byte per pixel channel.
    func makeSurface() throws -> IOSurface {
        let properties: [IOSurfacePropertyKey: Any] = [
            .width: 3, .height: 2, .bytesPerElement: 4, .bytesPerRow: 64,
            .pixelFormat: kCVPixelFormatType_32BGRA,
        ]
        let surface = try #require(IOSurface(properties: properties))
        surface.lock(options: [], seed: nil)
        let base = surface.baseAddress.assumingMemoryBound(to: UInt8.self)
        for row in 0..<2 {
            for byte in 0..<12 { base[row * 64 + byte] = UInt8(row * 12 + byte + 1) }
        }
        surface.unlock(options: [], seed: nil)
        return surface
    }

    @Test func copiesEveryRowIntoAPooledBuffer() throws {
        let surface = try makeSurface()
        let pool = try #require(FrameCopier.makePool(for: surface))
        let buffer = try #require(FrameCopier.copy(surface, into: pool))

        #expect(CVPixelBufferGetWidth(buffer) == 3)
        #expect(CVPixelBufferGetHeight(buffer) == 2)
        #expect(CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_32BGRA)
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let stride = CVPixelBufferGetBytesPerRow(buffer)
        let base = try #require(CVPixelBufferGetBaseAddress(buffer)).assumingMemoryBound(to: UInt8.self)
        for row in 0..<2 {
            #expect(Array(UnsafeBufferPointer(start: base + row * stride, count: 12))
                == (0..<12).map { UInt8(row * 12 + $0 + 1) })
        }
    }

    @Test func copyIsIndependentOfTheLiveSurface() throws {
        let surface = try makeSurface()
        let pool = try #require(FrameCopier.makePool(for: surface))
        let buffer = try #require(FrameCopier.copy(surface, into: pool))
        surface.lock(options: [], seed: nil)
        surface.baseAddress.assumingMemoryBound(to: UInt8.self)[0] = 0xEE
        surface.unlock(options: [], seed: nil)

        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        #expect(CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)[0] == 1)
    }
}
