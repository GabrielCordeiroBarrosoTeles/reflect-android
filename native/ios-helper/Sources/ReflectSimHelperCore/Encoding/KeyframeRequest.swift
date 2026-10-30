/// A pending keyframe request (ruling R11). It stays pending until a keyframe actually comes
/// out of the encoder, so a frame VideoToolbox drops (or encodes as a delta frame despite
/// `ForceKeyFrame`) does not lose the request: the next frame forces a keyframe again.
struct KeyframeRequest: Equatable {
    private(set) var pending = false

    mutating func request() {
        pending = true
    }

    mutating func emitted(keyframe: Bool) {
        if keyframe { pending = false }
    }
}
