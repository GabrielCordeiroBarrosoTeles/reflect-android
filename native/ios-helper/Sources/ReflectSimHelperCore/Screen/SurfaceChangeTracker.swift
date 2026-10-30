import IOSurface

/// Tells whether the framebuffer changed since the last look, from the IOSurface seed
/// (bumped on every write) and its id (a new surface after rotation or resize).
struct SurfaceChangeTracker {
    private var last: (id: IOSurfaceID, seed: UInt32)?

    mutating func hasChanged(_ surface: IOSurface) -> Bool {
        let current = (id: IOSurfaceGetID(surface), seed: IOSurfaceGetSeed(surface))
        defer { last = current }
        guard let last else { return true }
        return last.id != current.id || last.seed != current.seed
    }
}
