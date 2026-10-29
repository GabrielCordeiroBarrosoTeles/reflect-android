import CoreVideo
import Foundation
import IOSurface

/// Copies the live framebuffer into a pooled pixel buffer for the encoder.
///
/// Never wrap the live surface (`CVPixelBufferCreateWithIOSurface`): the simulator keeps
/// drawing into it and VideoToolbox then sees one frozen frame (spec §4.3). The surface lock
/// is held only for the memcpy, never across encoding.
public enum FrameCopier {
    /// A pool of IOSurface-backed buffers matching `surface`'s size and pixel format.
    public static func makePool(for surface: IOSurface) -> CVPixelBufferPool? {
        let attributes: [CFString: Any] = [
            kCVPixelBufferPixelFormatTypeKey: IOSurfaceGetPixelFormat(surface),
            kCVPixelBufferWidthKey: IOSurfaceGetWidth(surface),
            kCVPixelBufferHeightKey: IOSurfaceGetHeight(surface),
            kCVPixelBufferIOSurfacePropertiesKey: [:] as [CFString: Any],
        ]
        var pool: CVPixelBufferPool?
        CVPixelBufferPoolCreate(nil, nil, attributes as CFDictionary, &pool)
        return pool
    }

    /// Row-by-row copy (the two strides usually differ). Copies the overlapping area if the
    /// pool's buffers do not match the surface. Returns nil when no buffer is available.
    public static func copy(_ surface: IOSurface, into pool: CVPixelBufferPool) -> CVPixelBuffer? {
        var created: CVPixelBuffer?
        guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &created) == kCVReturnSuccess,
              let buffer = created
        else { return nil }

        guard IOSurfaceLock(surface, .readOnly, nil) == kIOReturnSuccess else { return nil }
        defer { IOSurfaceUnlock(surface, .readOnly, nil) }
        guard CVPixelBufferLockBaseAddress(buffer, []) == kCVReturnSuccess else { return nil }
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let destination = CVPixelBufferGetBaseAddress(buffer) else { return nil }

        let source = IOSurfaceGetBaseAddress(surface)
        let sourceStride = IOSurfaceGetBytesPerRow(surface)
        let destinationStride = CVPixelBufferGetBytesPerRow(buffer)
        let rows = min(IOSurfaceGetHeight(surface), CVPixelBufferGetHeight(buffer))
        let width = min(IOSurfaceGetWidth(surface), CVPixelBufferGetWidth(buffer))
        let rowBytes = min(width * IOSurfaceGetBytesPerElement(surface), sourceStride, destinationStride)
        for row in 0..<rows {
            memcpy(destination + row * destinationStride, source + row * sourceStride, rowBytes)
        }
        return buffer
    }
}
