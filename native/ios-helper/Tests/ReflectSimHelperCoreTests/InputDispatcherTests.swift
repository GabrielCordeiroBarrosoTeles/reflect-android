import CoreGraphics
import Testing
@testable import ReflectSimHelperCore

/// Records every call the dispatcher makes.
final class RecordingSink: InputSink {
    enum Call: Equatable {
        case touch(TouchPhase, CGPoint, UInt32)
        case key(UInt32, Bool)
        case button(ButtonName, Bool)
        case rotate
    }

    var calls: [Call] = []

    func touch(_ phase: TouchPhase, at point: CGPoint, id: UInt32) { calls.append(.touch(phase, point, id)) }
    func key(usage: UInt32, down: Bool) { calls.append(.key(usage, down)) }
    func button(_ name: ButtonName, down: Bool) { calls.append(.button(name, down)) }
    func rotate() { calls.append(.rotate) }
}

@Suite struct InputDispatcherTests {
    let size = CGSize(width: 393, height: 852)

    func make() -> (InputDispatcher, RecordingSink, Box<[String]>) {
        let sink = RecordingSink()
        let warnings = Box<[String]>([])
        let dispatcher = InputDispatcher(
            sink: sink, pointSize: size, onWarning: { warnings.value.append($0) }, pause: { _ in })
        return (dispatcher, sink, warnings)
    }

    @Test func touchIsForwardedWithTheSameId() {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.touch(phase: .down, x: 100, y: 200, id: 3))
        dispatcher.dispatch(.touch(phase: .move, x: 110, y: 210, id: 3))
        dispatcher.dispatch(.touch(phase: .up, x: 110, y: 210, id: 3))
        #expect(sink.calls == [
            .touch(.down, CGPoint(x: 100, y: 200), 3),
            .touch(.move, CGPoint(x: 110, y: 210), 3),
            .touch(.up, CGPoint(x: 110, y: 210), 3),
        ])
    }

    @Test func touchPointsAreClampedToTheScreen() {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.touch(phase: .down, x: 500, y: -3, id: 1))
        #expect(sink.calls == [.touch(.down, CGPoint(x: 393, y: 0), 1)])
    }

    @Test func scrollIsASixStepDragWithItsOwnId() throws {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.touch(phase: .down, x: 10, y: 10, id: 1))
        dispatcher.dispatch(.touch(phase: .up, x: 10, y: 10, id: 1))
        sink.calls.removeAll()

        dispatcher.dispatch(.scroll(x: 200, y: 400, dx: 0, dy: -120))

        let touches = sink.calls.compactMap { call -> (TouchPhase, CGPoint, UInt32)? in
            if case .touch(let p, let pt, let id) = call { return (p, pt, id) }
            return nil
        }
        #expect(touches.count == sink.calls.count)
        #expect(touches.first?.0 == .down)
        #expect(touches.first?.1 == CGPoint(x: 200, y: 400))
        #expect(touches.last?.0 == .up)
        #expect(touches.last?.1 == CGPoint(x: 200, y: 280))
        #expect(touches.filter { $0.0 == .move }.count >= 6)
        let ids = Set(touches.map(\.2))
        #expect(ids.count == 1)
        #expect(ids.first != 1)
    }

    @Test func scrollDragsOnBothAxesAndStaysOnScreen() {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.scroll(x: 380, y: 840, dx: 50, dy: 40))
        guard case .touch(.up, let end, _) = sink.calls.last else {
            Issue.record("no up"); return
        }
        #expect(end == CGPoint(x: 393, y: 852))
    }

    @Test func eachScrollGetsAFreshId() {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.scroll(x: 100, y: 100, dx: 0, dy: 30))
        dispatcher.dispatch(.scroll(x: 100, y: 100, dx: 0, dy: 30))
        let ids = sink.calls.compactMap { call -> UInt32? in
            if case .touch(.down, _, let id) = call { return id }
            return nil
        }
        #expect(ids.count == 2)
        #expect(ids[0] != ids[1])
    }

    @Test func keyIsForwarded() {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.key(usage: 4, down: true))
        dispatcher.dispatch(.key(usage: 4, down: false))
        #expect(sink.calls == [.key(4, true), .key(4, false)])
    }

    @Test func knownButtonsAreForwarded() {
        let (dispatcher, sink, warnings) = make()
        for name in ["home", "lock", "volumeUp", "volumeDown", "siri", "shake", "appSwitcher"] {
            dispatcher.dispatch(.button(name: name, down: true))
        }
        #expect(sink.calls == [
            .button(.home, true), .button(.lock, true), .button(.volumeUp, true),
            .button(.volumeDown, true), .button(.siri, true), .button(.shake, true),
            .button(.appSwitcher, true),
        ])
        #expect(warnings.value.isEmpty)
    }

    @Test func unknownButtonIsAWarning() {
        let (dispatcher, sink, warnings) = make()
        dispatcher.dispatch(.button(name: "bogus", down: true))
        #expect(sink.calls.isEmpty)
        #expect(warnings.value == ["unknown button bogus"])
    }

    @Test func rotateIsForwarded() {
        let (dispatcher, sink, _) = make()
        dispatcher.dispatch(.rotate)
        #expect(sink.calls == [.rotate])
    }

    @Test func nonInputCommandsAreIgnored() {
        let (dispatcher, sink, warnings) = make()
        dispatcher.dispatch(.keyframe)
        dispatcher.dispatch(.stop)
        dispatcher.dispatch(.simulatorApp(action: .hide))
        dispatcher.dispatch(.quality(bitrate: 1, fps: 1, maxSize: 1))
        #expect(sink.calls.isEmpty)
        #expect(warnings.value.isEmpty)
    }
}

final class Box<T> {
    var value: T
    init(_ value: T) { self.value = value }
}
