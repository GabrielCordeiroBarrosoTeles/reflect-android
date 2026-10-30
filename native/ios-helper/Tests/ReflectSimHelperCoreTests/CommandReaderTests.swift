import Testing
@testable import ReflectSimHelperCore

@Suite struct CommandReaderTests {
    func parse(_ s: String) -> ParsedLine { CommandReader.parse(line: s) }

    @Test func touch() {
        #expect(parse(#"{"type":"touch","phase":"down","x":10.5,"y":20,"id":1}"#) == .command(.touch(phase: .down, x: 10.5, y: 20, id: 1)))
        #expect(parse(#"{"type":"touch","phase":"move","x":1,"y":2,"id":0}"#) == .command(.touch(phase: .move, x: 1, y: 2, id: 0)))
        #expect(parse(#"{"type":"touch","phase":"up","x":1,"y":2,"id":0}"#) == .command(.touch(phase: .up, x: 1, y: 2, id: 0)))
    }

    @Test func scroll() {
        #expect(parse(#"{"type":"scroll","x":1,"y":2,"dx":3,"dy":-4}"#) == .command(.scroll(x: 1, y: 2, dx: 3, dy: -4)))
    }

    @Test func key() {
        #expect(parse(#"{"type":"key","usage":4,"down":true}"#) == .command(.key(usage: 4, down: true)))
    }

    @Test func button() {
        #expect(parse(#"{"type":"button","name":"home","down":false}"#) == .command(.button(name: "home", down: false)))
    }

    @Test func simpleCommands() {
        #expect(parse(#"{"type":"rotate"}"#) == .command(.rotate))
        #expect(parse(#"{"type":"keyframe"}"#) == .command(.keyframe))
        #expect(parse(#"{"type":"stop"}"#) == .command(.stop))
    }

    @Test func quality() {
        #expect(parse(#"{"type":"quality","bitrate":4000000,"fps":30,"maxSize":1280}"#) == .command(.quality(bitrate: 4_000_000, fps: 30, maxSize: 1280)))
    }

    @Test func simulatorApp() {
        #expect(parse(#"{"type":"simulatorApp","action":"hide"}"#) == .command(.simulatorApp(action: .hide)))
        #expect(parse(#"{"type":"simulatorApp","action":"show"}"#) == .command(.simulatorApp(action: .show)))
        #expect(parse(#"{"type":"simulatorApp","action":"quit"}"#) == .command(.simulatorApp(action: .quit)))
    }

    @Test func unknownType() {
        #expect(parse(#"{"type":"bogus"}"#) == .unknown("bogus"))
    }

    @Test func invalid() {
        #expect(parse("not json") == .invalid)
        #expect(parse(#"{"nope":1}"#) == .invalid)
        #expect(parse(#"{"type":"touch","phase":"zzz","x":1,"y":2,"id":0}"#) == .invalid)
        #expect(parse(#"{"type":"touch"}"#) == .invalid)
        #expect(parse(#"[1]"#) == .invalid)
    }
}
