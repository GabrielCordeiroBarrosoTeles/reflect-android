import Testing
@testable import ReflectSimHelperCore

@Suite struct KeyframeRequestTests {
    @Test func idleByDefault() {
        #expect(!KeyframeRequest().pending)
    }

    @Test func aRequestSurvivesUntilAKeyframeIsEmitted() {
        var request = KeyframeRequest()
        request.request()
        // The frame was handed to VideoToolbox but dropped, or came out as a delta frame.
        request.emitted(keyframe: false)
        #expect(request.pending)
        request.emitted(keyframe: true)
        #expect(!request.pending)
    }

    @Test func aNaturalKeyframeAlsoAnswersTheRequest() {
        var request = KeyframeRequest()
        request.request()
        request.emitted(keyframe: true)
        #expect(!request.pending)
    }
}
