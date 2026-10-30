import Foundation
import Testing
@testable import ReflectSimHelperCore

@Suite struct DigitizerMessageTests {
    func withBuffer(size: Int, fill: UInt8, _ body: (UnsafeMutableRawPointer) -> Void) -> [UInt8] {
        let raw = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 8)
        defer { raw.deallocate() }
        raw.initializeMemory(as: UInt8.self, repeating: fill, count: size)
        body(raw)
        return Array(UnsafeBufferPointer(start: raw.assumingMemoryBound(to: UInt8.self), count: size))
    }

    @Test func patchesBothTargetsAndClearsTheEdgeBytes() {
        let bytes = withBuffer(size: 0x180, fill: 0) { DigitizerMessage.patch($0, size: 0x180) }
        #expect(Array(bytes[0x6c..<0x70]) == [0x32, 0, 0, 0])
        #expect(Array(bytes[0x10c..<0x110]) == [0x32, 0, 0, 0])
        for offset in [0x3a, 0x3b, 0xda, 0xdb] { #expect(bytes[offset] == 0) }
        var untouched = bytes
        untouched[0x6c] = 0
        untouched[0x10c] = 0
        #expect(untouched.allSatisfy { $0 == 0 })
    }

    @Test func edgeBytesAreZeroedEvenWhenSet() {
        let bytes = withBuffer(size: 0x180, fill: 0xff) { DigitizerMessage.patch($0, size: 0x180) }
        for offset in [0x3a, 0x3b, 0xda, 0xdb] { #expect(bytes[offset] == 0) }
        #expect(Array(bytes[0x6c..<0x70]) == [0x32, 0, 0, 0])
        #expect(bytes[0x39] == 0xff)
        #expect(bytes[0x3c] == 0xff)
    }

    @Test func aSinglePayloadMessageOnlyGetsTheFirstRecordPatched() {
        let bytes = withBuffer(size: 0xc0, fill: 0xff) { DigitizerMessage.patch($0, size: 0xc0) }
        #expect(Array(bytes[0x6c..<0x70]) == [0x32, 0, 0, 0])
        #expect(bytes[0x3a] == 0 && bytes[0x3b] == 0)
        #expect(bytes[0xbf] == 0xff)
    }

    @Test func aShortMessageIsLeftAlone() {
        let bytes = withBuffer(size: 0x20, fill: 0xff) { DigitizerMessage.patch($0, size: 0x20) }
        #expect(bytes.allSatisfy { $0 == 0xff })
    }
}
