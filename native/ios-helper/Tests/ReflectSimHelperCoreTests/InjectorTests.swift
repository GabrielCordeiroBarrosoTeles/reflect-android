import CIndigo
import Foundation
import Testing
@testable import ReflectSimHelperCore

@Suite struct ButtonRouteTests {
    @Test func indigoButtonsUseTheHardwareTarget() {
        #expect(ButtonInjector.route(for: .home) == .indigoButton(source: 0x0, target: 0x33))
        #expect(ButtonInjector.route(for: .lock) == .indigoButton(source: 0x1, target: 0x33))
        #expect(ButtonInjector.route(for: .siri) == .indigoButton(source: 0x400002, target: 0x33))
    }

    @Test func volumeUsesConsumerPageUsages() {
        #expect(ButtonInjector.route(for: .volumeUp) == .hidArbitrary(page: 12, usage: 233))
        #expect(ButtonInjector.route(for: .volumeDown) == .hidArbitrary(page: 12, usage: 234))
    }

    @Test func appSwitcherAndShakeAreSpecial() {
        #expect(ButtonInjector.route(for: .appSwitcher) == .doubleHome)
        #expect(ButtonInjector.route(for: .shake) == .shake)
    }
}

@Suite struct KeyboardMessageTests {
    @Test func buildsAnIndigoKeyboardMessage() {
        let raw = KeyboardInjector.message(usage: 4, down: true, timestamp: 77)
        defer { free(raw) }
        let message = raw.assumingMemoryBound(to: IndigoMessage.self).pointee
        #expect(message.innerSize == UInt32(MemoryLayout<IndigoPayload>.size))
        #expect(message.eventType == UInt8(IndigoEventTypeButton))
        #expect(message.payload.eventKind == 2)
        #expect(message.payload.timestamp == 77)
        #expect(message.payload.event.button.eventSource == 0x2710)
        #expect(message.payload.event.button.eventTarget == 0x64)
        #expect(message.payload.event.button.eventType == 1)
        #expect(message.payload.event.button.keyCode == 4)
        #expect(message.header.msgh_size == 0)
    }

    @Test func keyUpUsesDirectionTwo() {
        let raw = KeyboardInjector.message(usage: 0x2a, down: false, timestamp: 0)
        defer { free(raw) }
        let button = raw.assumingMemoryBound(to: IndigoMessage.self).pointee.payload.event.button
        #expect(button.eventType == 2)
        #expect(button.keyCode == 0x2a)
    }
}

@Suite struct OrientationTests {
    @Test func rotationCyclesThroughTheFourOrientations() {
        var o = DeviceOrientation.portrait
        var seen: [DeviceOrientation] = []
        for _ in 0..<4 {
            o = o.next
            seen.append(o)
        }
        #expect(seen == [.landscapeLeft, .portraitUpsideDown, .landscapeRight, .portrait])
    }

    @Test func wireNamesAndUIKitValues() {
        #expect(DeviceOrientation.portrait.rawValue == 1)
        #expect(DeviceOrientation.portraitUpsideDown.rawValue == 2)
        #expect(DeviceOrientation.landscapeLeft.rawValue == 3)
        #expect(DeviceOrientation.landscapeRight.rawValue == 4)
        #expect(DeviceOrientation.landscapeLeft.name == "landscapeLeft")
        #expect(DeviceOrientation.portraitUpsideDown.name == "portraitUpsideDown")
    }

    func u32(_ bytes: [UInt8], _ offset: Int) -> UInt32 {
        bytes[offset..<offset + 4].enumerated().reduce(0) { $0 | UInt32($1.element) << (8 * $1.offset) }
    }

    @Test func gsEventMessageLayout() {
        let bytes = OrientationController.message(.landscapeLeft, port: 0x1234)
        #expect(bytes.count == 112)
        #expect(u32(bytes, 0x00) == 0x13)
        #expect(u32(bytes, 0x04) == 108)
        #expect(u32(bytes, 0x08) == 0x1234)
        #expect(u32(bytes, 0x14) == 0x7b)
        #expect(u32(bytes, 0x18) == 50 | 0x20000)
        #expect(u32(bytes, 0x48) == 4)
        #expect(u32(bytes, 0x4c) == 3)
    }
}

@Suite struct NotifyEventsTests {
    @Test func shakePostsTheUIKitNotificationInTheSimulator() throws {
        let key = "/usr/bin/xcrun simctl spawn U-1 notifyutil -p com.apple.UIKit.SimulatorShake"
        try NotifyEvents(udid: "U-1", runner: FakeRunner(outputs: [key: ""])).shake()
    }

    @Test func shakeFailureIsThrown() {
        #expect(throws: (any Error).self) {
            try NotifyEvents(udid: "U-1", runner: FakeRunner(outputs: [:])).shake()
        }
    }
}
