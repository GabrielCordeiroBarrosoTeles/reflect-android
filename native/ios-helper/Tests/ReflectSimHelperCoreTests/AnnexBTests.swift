import CoreGraphics
import Foundation
import Testing
@testable import ReflectSimHelperCore

@Suite struct AnnexBTests {
    /// `00 00 00 01` followed by `bytes`.
    func nal(_ bytes: UInt8...) -> [UInt8] {
        [0, 0, 0, 1] + bytes
    }

    @Test func twoAVCCNalsBecomeTwoStartCodePrefixedNals() {
        let avcc = Data([0, 0, 0, 2, 0x65, 0xAA, 0, 0, 0, 3, 0x41, 0xBB, 0xCC])
        let annexB = AnnexB.fromAVCC(avcc)
        #expect(Array(annexB) == nal(0x65, 0xAA) + nal(0x41, 0xBB, 0xCC))
    }

    @Test func truncatedLengthStopsWithoutCrashing() {
        // Second NAL claims 9 bytes but only 1 follows: keep the first, drop the rest.
        let avcc = Data([0, 0, 0, 1, 0x65, 0, 0, 0, 9, 0x41])
        #expect(Array(AnnexB.fromAVCC(avcc)) == nal(0x65))
    }

    @Test func truncatedLengthFieldStopsWithoutCrashing() {
        #expect(AnnexB.fromAVCC(Data([0, 0])).isEmpty)
    }

    @Test func honoursShorterLengthPrefixes() {
        let avcc = Data([0, 2, 0x67, 0x42])
        #expect(Array(AnnexB.fromAVCC(avcc, nalLengthSize: 2)) == nal(0x67, 0x42))
    }

    @Test func worksOnSlicedData() {
        let whole = Data([0xFF, 0xFF, 0, 0, 0, 1, 0x09])
        #expect(Array(AnnexB.fromAVCC(whole[2...])) == nal(0x09))
    }

    @Test func parameterSetsArePrefixedInOrder() {
        let config = AnnexB.fromParameterSets([Data([0x67, 0x42]), Data([0x68, 0xCE])])
        #expect(Array(config) == nal(0x67, 0x42) + nal(0x68, 0xCE))
    }
}
