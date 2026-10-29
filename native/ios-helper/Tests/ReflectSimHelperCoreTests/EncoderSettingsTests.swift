import CoreGraphics
import Testing
@testable import ReflectSimHelperCore

@Suite struct EncoderSettingsTests {
    let iPhone15 = CGSize(width: 1179, height: 2556)

    @Test func scalesLongestSideDownToMaxSizeAndRoundsToEven() {
        let settings = EncoderSettings(fps: 60, bitrate: 8_000_000, maxSize: 1920)
        #expect(settings.outputSize(for: iPhone15) == CGSize(width: 884, height: 1920))
    }

    @Test func doesNotUpscaleWhenMaxSizeIsLarger() {
        let settings = EncoderSettings(fps: 60, bitrate: 8_000_000, maxSize: 4000)
        #expect(settings.outputSize(for: iPhone15) == CGSize(width: 1178, height: 2556))
    }

    @Test func landscapeUsesWidthAsLongestSide() {
        let settings = EncoderSettings(fps: 60, bitrate: 8_000_000, maxSize: 1920)
        #expect(settings.outputSize(for: CGSize(width: 2556, height: 1179)) == CGSize(width: 1920, height: 884))
    }

    @Test func nonPositiveMaxSizeMeansNoLimit() {
        let settings = EncoderSettings(fps: 60, bitrate: 8_000_000, maxSize: 0)
        #expect(settings.outputSize(for: iPhone15) == CGSize(width: 1178, height: 2556))
    }

    @Test func clampsNonsenseValues() {
        let settings = EncoderSettings(fps: 0, bitrate: -5, maxSize: 1920)
        #expect(settings.fps == 1)
        #expect(settings.bitrate == EncoderSettings.minimumBitrate)
    }

    @Test func keyframeIntervalIsTwoSeconds() {
        #expect(EncoderSettings(fps: 30, bitrate: 1, maxSize: 0).maxKeyFrameInterval == 60)
    }
}
