import CoreMedia
import CoreVideo
import Foundation
import IOSurface
import VideoToolbox

/// Where encoded video goes. `FrameWriter` is the production sink.
public protocol VideoSink: AnyObject, Sendable {
    func writeVideoConfig(width: UInt16, height: UInt16, annexB: Data) throws
    func writeVideoFrame(keyframe: Bool, pts: UInt64, payload: Data) throws
}

extension FrameWriter: VideoSink {}

/// Real-time H.264 over VideoToolbox: Baseline, `RealTime`, no frame reordering, a keyframe
/// at least every `fps * 2` frames and every 2 s. Session setup adapted from luispadron/baguette
/// `H264Encoder.swift` (Apache-2.0); the copy-don't-wrap rule comes from our spike (§4.3).
///
/// Frames are encoded when the screen changes (`submit`), throttled to `fps` with a trailing
/// capture so the last change is never dropped. When nothing was encoded for a second the
/// last copied frame is encoded again, so a keyframe request on a static screen is answered.
///
/// Threads: all capture/encode state lives on `queue`; all writes happen on `outputQueue`, so
/// frames never interleave. The first failed write calls `onOutputClosed` once (ruling R7).
public final class H264Encoder: @unchecked Sendable {
    static let idleRefreshNanos: UInt64 = 1_000_000_000
    /// A keyframe at least this often (seconds), whatever the frame rate (R11).
    static let maxKeyFrameIntervalSeconds = 2
    /// How often the idle refresh is checked: a static screen is re-encoded 1–1.25 s after
    /// the last frame (a 1 s check could leave a gap of almost 2 s).
    static let idleCheckInterval = DispatchTimeInterval.milliseconds(250)

    private let sink: VideoSink
    private let onOutputClosed: @Sendable () -> Void
    private let log: @Sendable (String) -> Void
    private let queue = DispatchQueue(label: "reflect.encoder", qos: .userInteractive)
    private let outputQueue = DispatchQueue(label: "reflect.encoder.output", qos: .userInteractive)

    // MARK: state on `queue`
    private var settings: EncoderSettings
    private var session: VTCompressionSession?
    private var sessionInputSize = CGSize.zero
    private var sessionOutputSize = CGSize.zero
    private var pool: CVPixelBufferPool?
    private var poolKey: (width: Int, height: Int, format: OSType) = (0, 0, 0)
    private var pendingSurface: IOSurface?
    private var lastBuffer: CVPixelBuffer?
    private var lastEncodeNanos: UInt64 = 0
    private var captureScheduled = false
    private var keyframeRequest = KeyframeRequest()
    private var lastPts: UInt64 = 0
    private var startNanos: UInt64 = 0
    private var idleTimer: DispatchSourceTimer?
    private var stopped = false

    // MARK: state on `outputQueue`
    private var lastConfig: (width: UInt16, height: UInt16, annexB: Data)?
    private var closed = false

    public init(
        settings: EncoderSettings,
        sink: VideoSink,
        onOutputClosed: @escaping @Sendable () -> Void,
        log: @escaping @Sendable (String) -> Void = { _ in }
    ) {
        self.settings = settings
        self.sink = sink
        self.onOutputClosed = onOutputClosed
        self.log = log
    }

    /// Starts the pts clock and the idle refresh. Call before the first `submit`.
    public func start() {
        queue.sync {
            startNanos = Self.now()
            let timer = DispatchSource.makeTimerSource(queue: queue)
            timer.schedule(
                deadline: .now() + Self.idleCheckInterval, repeating: Self.idleCheckInterval,
                leeway: .milliseconds(20))
            timer.setEventHandler { [weak self] in self?.idleTick() }
            timer.resume()
            idleTimer = timer
        }
    }

    /// A new frame was composited. Any thread.
    public func submit(_ surface: IOSurface) {
        queue.async { [self] in
            guard !stopped else { return }
            pendingSurface = surface
            scheduleCapture()
        }
    }

    /// Forces frames to be keyframes until one is emitted (R11); re-encodes the last frame
    /// right away (within the fps throttle) so a static screen answers too.
    public func requestKeyframe() {
        queue.async { [self] in
            guard !stopped else { return }
            keyframeRequest.request()
            scheduleCapture()
        }
    }

    /// Applies new settings by recreating the session (the next frame is a keyframe).
    public func update(_ newSettings: EncoderSettings) {
        queue.async { [self] in
            guard !stopped, newSettings != settings else { return }
            settings = newSettings
            tearDownSession()
            scheduleCapture()
        }
    }

    /// Stops encoding and flushes pending output. Not callable from the encoder's queues.
    public func stop() {
        queue.sync {
            stopped = true
            idleTimer?.cancel()
            idleTimer = nil
            tearDownSession()
            pendingSurface = nil
            lastBuffer = nil
        }
        // Flushed frames were queued for writing; let them reach the sink before returning.
        outputQueue.sync {}
    }

    // MARK: - capture (on `queue`)

    private func idleTick() {
        guard !stopped, lastBuffer != nil, Self.now() - lastEncodeNanos >= Self.idleRefreshNanos else { return }
        scheduleCapture()
    }

    /// Captures now if the fps budget allows, otherwise once at the next allowed time.
    private func scheduleCapture() {
        guard !captureScheduled else { return }
        let next = lastEncodeNanos + 1_000_000_000 / UInt64(settings.fps)
        let now = Self.now()
        if lastEncodeNanos == 0 || now >= next {
            capture()
            return
        }
        captureScheduled = true
        queue.asyncAfter(deadline: DispatchTime(uptimeNanoseconds: next)) { [self] in
            captureScheduled = false
            capture()
        }
    }

    /// Copies the pending surface (or reuses the last copy) and encodes it.
    private func capture() {
        guard !stopped else { return }
        if let surface = pendingSurface {
            pendingSurface = nil
            if let copy = copy(surface) { lastBuffer = copy }
        }
        guard let buffer = lastBuffer else { return }
        encode(buffer)
    }

    private func copy(_ surface: IOSurface) -> CVPixelBuffer? {
        let key = (IOSurfaceGetWidth(surface), IOSurfaceGetHeight(surface), IOSurfaceGetPixelFormat(surface))
        if pool == nil || key != poolKey {
            pool = FrameCopier.makePool(for: surface)
            poolKey = key
        }
        guard let pool else { return nil }
        return FrameCopier.copy(surface, into: pool)
    }

    private func encode(_ buffer: CVPixelBuffer) {
        let inputSize = CGSize(width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer))
        if session == nil || inputSize != sessionInputSize {
            makeSession(inputSize: inputSize)
        }
        guard let session else { return }

        // Microseconds since capture start, strictly increasing.
        let pts = max((Self.now() - startNanos) / 1_000, lastPts + 1)
        lastPts = pts
        let properties = keyframeRequest.pending
            ? [kVTEncodeFrameOptionKey_ForceKeyFrame: kCFBooleanTrue!] as CFDictionary
            : nil
        let width = UInt16(sessionOutputSize.width), height = UInt16(sessionOutputSize.height)

        let status = VTCompressionSessionEncodeFrame(
            session,
            imageBuffer: buffer,
            presentationTimeStamp: CMTime(value: CMTimeValue(pts), timescale: 1_000_000),
            duration: .invalid,
            frameProperties: properties,
            infoFlagsOut: nil
        ) { [weak self] status, _, sample in
            guard let self, status == noErr, let sample else { return }
            self.emit(sample, width: width, height: height, pts: pts)
        }
        lastEncodeNanos = Self.now()
        // The keyframe request is cleared by `emit` when a keyframe comes out, not here: a
        // frame accepted now may still be dropped by VideoToolbox.
        if status != noErr {
            log("encode failed (\(status)); recreating the encoder")
            tearDownSession()
        }
    }

    // MARK: - session (on `queue`)

    private func makeSession(inputSize: CGSize) {
        tearDownSession()
        let output = settings.outputSize(for: inputSize)
        var created: VTCompressionSession?
        // A source buffer larger than the session is scaled by VideoToolbox.
        let status = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(output.width),
            height: Int32(output.height),
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: nil,
            imageBufferAttributes: nil,
            compressedDataAllocator: nil,
            outputCallback: nil,
            refcon: nil,
            compressionSessionOut: &created)
        guard status == noErr, let created else {
            log("cannot create the H.264 encoder (\(status))")
            return
        }
        let properties: [(CFString, CFTypeRef)] = [
            (kVTCompressionPropertyKey_RealTime, kCFBooleanTrue),
            (kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel),
            (kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse),
            (kVTCompressionPropertyKey_MaxKeyFrameInterval, settings.maxKeyFrameInterval as CFNumber),
            (kVTCompressionPropertyKey_MaxKeyFrameIntervalDuration, Self.maxKeyFrameIntervalSeconds as CFNumber),
            (kVTCompressionPropertyKey_ExpectedFrameRate, settings.fps as CFNumber),
            (kVTCompressionPropertyKey_AverageBitRate, settings.bitrate as CFNumber),
        ]
        for (key, value) in properties {
            let result = VTSessionSetProperty(created, key: key, value: value)
            if result != noErr { log("encoder property \(key) rejected (\(result))") }
        }
        VTCompressionSessionPrepareToEncodeFrames(created)
        session = created
        sessionInputSize = inputSize
        sessionOutputSize = output
        log("encoding \(Int(inputSize.width))x\(Int(inputSize.height)) -> \(Int(output.width))x\(Int(output.height)) @\(settings.fps) fps, \(settings.bitrate) bps")
    }

    /// Flushes (so the old session's output is queued before the new one's) and invalidates.
    private func tearDownSession() {
        guard let old = session else { return }
        session = nil
        VTCompressionSessionCompleteFrames(old, untilPresentationTimeStamp: .invalid)
        VTCompressionSessionInvalidate(old)
    }

    // MARK: - output (VT callback thread → `outputQueue`)

    private func emit(_ sample: CMSampleBuffer, width: UInt16, height: UInt16, pts: UInt64) {
        guard let parsed = Self.parse(sample) else { return }
        if parsed.keyframe {
            queue.async { [self] in keyframeRequest.emitted(keyframe: true) }
        }
        outputQueue.async { [self] in
            guard !closed else { return }
            do {
                // video-config before every keyframe (late joiners) and whenever SPS/PPS or
                // size change.
                if let config = parsed.config,
                   parsed.keyframe || lastConfig.map({ $0 != (width, height, config) }) ?? true {
                    try sink.writeVideoConfig(width: width, height: height, annexB: config)
                    lastConfig = (width, height, config)
                }
                try sink.writeVideoFrame(keyframe: parsed.keyframe, pts: pts, payload: parsed.payload)
            } catch {
                closed = true
                onOutputClosed()
            }
        }
    }

    /// Keyframe flag, Annex-B SPS+PPS (if present) and Annex-B payload of an encoded sample.
    static func parse(_ sample: CMSampleBuffer) -> (keyframe: Bool, config: Data?, payload: Data)? {
        guard let block = CMSampleBufferGetDataBuffer(sample) else { return nil }
        let length = CMBlockBufferGetDataLength(block)
        var avcc = Data(count: length)
        let copied = avcc.withUnsafeMutableBytes { bytes in
            CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: bytes.baseAddress!)
        }
        guard copied == kCMBlockBufferNoErr else { return nil }

        var config: Data?
        var nalLengthSize: Int32 = 4
        if let format = CMSampleBufferGetFormatDescription(sample) {
            var count = 0
            var sets: [Data] = []
            if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                format, parameterSetIndex: 0, parameterSetPointerOut: nil, parameterSetSizeOut: nil,
                parameterSetCountOut: &count, nalUnitHeaderLengthOut: &nalLengthSize) == noErr {
                for index in 0..<count {
                    var pointer: UnsafePointer<UInt8>?
                    var size = 0
                    if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                        format, parameterSetIndex: index, parameterSetPointerOut: &pointer,
                        parameterSetSizeOut: &size, parameterSetCountOut: nil,
                        nalUnitHeaderLengthOut: nil) == noErr, let pointer {
                        sets.append(Data(bytes: pointer, count: size))
                    }
                }
            }
            if !sets.isEmpty { config = AnnexB.fromParameterSets(sets) }
        }
        return (isKeyframe(sample), config, AnnexB.fromAVCC(avcc, nalLengthSize: Int(nalLengthSize)))
    }

    private static func isKeyframe(_ sample: CMSampleBuffer) -> Bool {
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sample, createIfNecessary: false)
                as? [[CFString: Any]],
              let first = attachments.first
        else { return true }
        return !((first[kCMSampleAttachmentKey_NotSync] as? Bool) ?? false)
    }

    private static func now() -> UInt64 { DispatchTime.now().uptimeNanoseconds }
}
