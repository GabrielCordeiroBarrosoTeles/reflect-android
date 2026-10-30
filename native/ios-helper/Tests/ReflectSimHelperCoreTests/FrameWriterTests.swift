import Foundation
import Testing
@testable import ReflectSimHelperCore

final class Capture: @unchecked Sendable {
    var data = Data()
}

@Suite struct FrameWriterTests {
    func makeWriter() -> (FrameWriter, Capture) {
        let c = Capture()
        return (FrameWriter { c.data.append($0) }, c)
    }

    @Test func helloFrameHasTypeAndBigEndianLength() throws {
        let (w, c) = makeWriter()
        let hello = Hello(
            protocol: 1, xcodeVersion: "26.6",
            device: DeviceInfo(name: "iPhone", pointWidth: 393, pointHeight: 852, scale: 3),
            capabilities: ["touch"])
        try w.writeHello(hello)
        let json = Data(c.data[5...])
        let len = UInt32(json.count)
        #expect(c.data[0] == 0x01)
        #expect(Array(c.data[1..<5]) == [UInt8(len >> 24), UInt8((len >> 16) & 0xff), UInt8((len >> 8) & 0xff), UInt8(len & 0xff)])
        #expect(try JSONDecoder().decode(Hello.self, from: json) == hello)
    }

    @Test func videoFrameEncodesFlagsAndPts() throws {
        let (w, c) = makeWriter()
        try w.writeVideoFrame(keyframe: true, pts: 1_000_000, payload: Data([0xAA, 0xBB]))
        #expect(Array(c.data) == [0x03, 0, 0, 0, 11, 0x01, 0, 0, 0, 0, 0, 0x0F, 0x42, 0x40, 0xAA, 0xBB])
    }

    @Test func deltaFrameHasZeroFlags() throws {
        let (w, c) = makeWriter()
        try w.writeVideoFrame(keyframe: false, pts: 0, payload: Data())
        #expect(c.data[5] == 0x00)
    }

    @Test func videoConfigEncodesSize() throws {
        let (w, c) = makeWriter()
        try w.writeVideoConfig(width: 1170, height: 2532, annexB: Data([0x01]))
        #expect(Array(c.data) == [0x02, 0, 0, 0, 5, 0x04, 0x92, 0x09, 0xE4, 0x01])
    }

    @Test func errorEventCarriesCode() throws {
        let (w, c) = makeWriter()
        try w.writeError(.deviceNotFound(udid: "U"))
        #expect(c.data[0] == 0x04)
        let obj = try JSONSerialization.jsonObject(with: Data(c.data[5...])) as? [String: String]
        #expect(obj == ["type": "error", "code": "device-not-found", "message": "no simulator with UDID U"])
    }

    @Test func sinkFailureIsSurfacedAsOutputClosed() {
        struct Broken: Error {}
        let w = FrameWriter { _ in throw Broken() }
        #expect(throws: FrameWriterError.outputClosed) { try w.writeEvent(type: "warning", message: "x") }
        #expect(throws: FrameWriterError.outputClosed) { try w.writeVideoFrame(keyframe: false, pts: 0, payload: Data()) }
        #expect(throws: FrameWriterError.outputClosed) { try w.writeVideoConfig(width: 1, height: 1, annexB: Data()) }
    }

    @Test func eventFrameCarriesJson() throws {
        let (w, c) = makeWriter()
        try w.writeEvent(type: "warning", message: "unknown command x")
        #expect(c.data[0] == 0x04)
        let obj = try JSONSerialization.jsonObject(with: Data(c.data[5...])) as? [String: String]
        #expect(obj == ["type": "warning", "message": "unknown command x"])
    }

    @Test func orientationChangedEvent() throws {
        let (w, c) = makeWriter()
        try w.writeOrientationChanged(.landscapeLeft)
        #expect(c.data[0] == 0x04)
        let obj = try JSONSerialization.jsonObject(with: Data(c.data[5...])) as? [String: String]
        #expect(obj == ["type": "orientation-changed", "orientation": "landscapeLeft"])
    }
}
