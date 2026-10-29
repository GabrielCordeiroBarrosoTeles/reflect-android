import Foundation

/// Converts VideoToolbox output (AVCC: each NAL prefixed by a big-endian length) to
/// Annex-B (each NAL prefixed by the start code `00 00 00 01`), the format the webview's
/// decoder and the wire protocol use.
public enum AnnexB {
    public static let startCode: [UInt8] = [0, 0, 0, 1]

    /// Malformed input (a truncated length field or a NAL shorter than its length) stops the
    /// conversion; the NALs read so far are returned.
    public static func fromAVCC(_ data: Data, nalLengthSize: Int = 4) -> Data {
        var out = Data(capacity: data.count + 16)
        var offset = data.startIndex
        while offset + nalLengthSize <= data.endIndex {
            var length = 0
            for byte in data[offset..<offset + nalLengthSize] {
                length = length << 8 | Int(byte)
            }
            let nalStart = offset + nalLengthSize
            guard length > 0, nalStart + length <= data.endIndex else { break }
            out.append(contentsOf: startCode)
            out.append(data[nalStart..<nalStart + length])
            offset = nalStart + length
        }
        return out
    }

    /// Start-code-prefixed parameter sets (SPS then PPS) for a `video-config` payload.
    public static func fromParameterSets(_ sets: [Data]) -> Data {
        var out = Data()
        for set in sets {
            out.append(contentsOf: startCode)
            out.append(set)
        }
        return out
    }
}
