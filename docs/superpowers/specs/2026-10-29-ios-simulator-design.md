# iOS Simulator (and Android Emulator) in Reflect — Design

- **Date:** 2026-10-29
- **Issue:** [#34](https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/issues/34)
- **Status:** Reviewed, awaiting owner approval

## 1. Intent

Today Reflect mirrors a physical Android phone into the VS Code side bar. When a developer runs an iOS Simulator from Xcode (or an Android Emulator from Android Studio), it lives in its own window, away from the code.

With this work, a running simulator shows up in Reflect with a **Bring to Reflect** button. One click takes it out of its window and into the side bar, where it is mirrored, controlled with mouse and keyboard, and gets the same tools Reflect already offers for Android, plus what an iOS developer needs day to day.

The owner wants **everything**: full parity with the Android experience plus the iOS-specific tools listed in §8. Order: **iOS Simulator first**, Android Emulator after. Code must follow SOLID and clean code, in line with the existing codebase.

## 2. Goals, non-goals, anti-goals

### Goals

1. Detect booted iOS Simulators (and, later, running Android Emulators) and list them next to physical devices.
2. **Bring to Reflect**: mirror the simulator in the side bar and get the Simulator.app window out of the way. Closing the mirror can give the window back.
3. Mirror at up to 60 fps with low latency through the existing H.264 → WebCodecs pipeline.
4. Full control: tap, drag, scroll, pinch, keyboard typing, hardware buttons (Home, Lock, volume, Siri, Shake), rotation, clipboard sync.
5. Parity with every existing Android feature that makes sense on iOS: toolbar, screenshot and MP4 recording, device frame and 1:1 zoom, auto-reconnect, and the Tools tabs (Component, Network, Logs, Storage, Device, Performance, Actions).
6. The iOS extras from §8 (push, location, permissions, appearance, status bar, Face ID, sandbox browser, UserDefaults editor, crash reports, etc.).
7. iPhone and Android side by side (two mirrors at once).
8. Android Emulator support, last.
9. Nothing to install beyond Xcode: the iOS helper ships inside the extension, as the scrcpy server already does.

### Non-goals

- Physical iPhones (needs a different stack: CoreDevice/usbmux, signing). Out of scope.
- Windows/Linux support for iOS. iOS features only exist on macOS. The extension must keep working on all three platforms for Android.
- Replacing Xcode for building/running the app. Reflect mirrors and inspects; building stays with Xcode/`expo run:ios`/Metro.
- tvOS, watchOS, visionOS simulators.
- Camera substitution (baguette's `DYLD_INSERT_LIBRARIES` approach). Too invasive for now.

### Anti-goals (would make this a failure even if it technically works)

- Android regressions. Physical-device mirroring must behave exactly as today.
- Silent breakage on a new Xcode. When a private symbol is missing or changes, the user must see a clear message ("This Xcode version is not supported yet") and Android must keep working.
- Platform `if`s scattered through the code (`if (device.platform === 'ios')` in controllers, tabs, or webview). Platform differences live behind interfaces.
- Asking the user to `brew install` anything.
- Touching the user's simulators in ways they did not ask for (booting, erasing, quitting Simulator.app) without an explicit action.

## 3. Constraints

- **Repo rules** (CONTRIBUTING.md): 100% line/branch/function coverage on `src/**/*.ts` (CI fails below); `src/extension.ts` is the only composition root; small classes behind interfaces; named patterns (Strategy, Facade, Mediator, Command…); conventional commits; no telemetry.
- **Platforms:** CI builds on ubuntu, macOS and Windows; release runs on ubuntu. The Swift helper can only be built on macOS, so packaging must change (§10).
- **Tooling found on the owner's machine:** Xcode 26.6, Swift 6.3, Apple Silicon, macOS 27, iOS 26.5 runtime. `idb`/`axe` are not installed and must not be required.
- **Private APIs:** video and input need `CoreSimulator.framework` and `SimulatorKit.framework`, loaded at runtime from the active Xcode (`xcode-select -p`). They are undocumented and change between Xcode versions.
- **Licenses:** the helper adapts recipes from facebook/idb (MIT) and luispadron/baguette (Apache-2.0). Both notices go into `THIRD_PARTY_NOTICES.md`, and the helper sources credit them where the recipes are used.

## 4. What the spike proved (2026-10-29)

A throwaway Swift helper (not kept) ran against an iPhone 15 / iOS 26.5 booted **headless** (no Simulator.app window):

- **Video works:** H.264 Baseline, ~27 fps on a 30 fps timer, 1179×2556 → 1178×2556 (VideoToolbox rounds odd widths), decoded by ffmpeg and visually correct.
- **Input works:** taps opened Settings, navigated into *General* and back.

Pitfalls found, which the design must handle:

1. **Touch recipe.** The idb/AXe recipe (5-arg `IndigoHIDMessageForMouseNSEvent`) is unreliable on iOS 26: taps land in the wrong place or are dropped. What works is baguette's: build an `IOHIDEventCreateDigitizerEvent` parent with an `IOHIDEventCreateDigitizerFingerEvent` child, wrap it with `IndigoHIDMessageForTrackpadEventFromHIDEventRef`, patch the target (`0x32` at `0x6c`/`0x10c`) and edge bytes (`0x3a/0x3b`, `0xda/0xdb`), send through `SimDeviceLegacyHIDClient`. Warm up with `IndigoHIDMessageToCreatePointerService` / `…MouseService` first.
2. **Compositing needs a consumer.** Register `registerScreenCallbacksWithUUID:callbackQueue:frameCallback:surfacesChangedCallback:propertiesChangedCallback:` on the display descriptor; frame callbacks drive capture.
3. **Do not hand the IOSurface to VideoToolbox.** Wrapping the live surface with `CVPixelBufferCreateWithIOSurface` freezes the video. Copy each frame into a buffer from the encoder's pool.
4. **Remote proxies.** CoreSimulator objects are ROCK proxies: KVC fails on them; call selectors directly. The display is the `com.apple.framebuffer.display` port that has a `descriptor` with `framebufferSurface`.
5. **The descriptor and callbacks must be retained** for the session's lifetime.

## 5. Architecture

### 5.1 Today

`DeviceInfo` is adb-shaped (`serial`, `transportId`). `IDeviceControl` exposes `AndroidKeyCode`, `back`, `recents`, `setScreenPower`. `MirrorSession` is scrcpy. Logs, Performance, Device and Actions run on `IDeviceShell` (`adb shell`). Component, Network and Storage talk to Metro (CDP) and are mostly platform-neutral; `selectTarget` matches Metro targets by device model.

The webview already only knows about H.264 packets, touch/scroll/key/text input and action ids, which is the right seam.

### 5.2 Target: platforms behind ports

Introduce a **platform** concept. Each platform is a set of adapters implementing small, capability-focused interfaces (ISP). The core (mirror controller, tools tabs, commands) depends only on those interfaces (DIP). Adding the Android Emulator or a future platform means adding adapters, not editing the core (OCP).

```
                         ┌──────────────────── core (platform-neutral) ────────────────────┐
                         │ MirrorController · MirrorManager · ToolsViewProvider · tabs ·    │
                         │ commands · webview protocol · recording · captures · inspector   │
                         └──────────────▲──────────────────────────────▲───────────────────┘
                                        │ ports (interfaces)           │
           ┌────────────────────────────┴───────┐          ┌───────────┴──────────────────────┐
           │ android/ (existing code, moved)     │          │ ios/ (new)                       │
           │ AdbDeviceTracker · ScrcpyMirrorSess.│          │ SimctlDeviceTracker · HelperMirr.│
           │ AdbLogSource · AdbPerformanceSource │          │ SimLogSource · SimPerfSource     │
           │ AdbAppActions · AdbDeviceInfo …     │          │ SimAppActions · SimDeviceInfo …  │
           └─────────────────────────────────────┘          └──────────────┬───────────────────┘
                                                                           │ stdio (framed)
                                                             ┌─────────────┴───────────────┐
                                                             │ reflect-sim-helper (Swift)   │
                                                             │ CoreSimulator · SimulatorKit │
                                                             │ VideoToolbox                 │
                                                             └──────────────────────────────┘
```

Key types (names indicative; the builder may refine them):

- **`Device`** replaces `DeviceInfo` in the core: `{ id, platform: 'android' | 'ios', kind: 'physical' | 'emulator' | 'simulator', name, model, state }`. Android-only data (`serial`, `transportId`) stays inside the Android adapters, keyed by `id`.
- **`IDeviceDiscovery`**: `devices`, `onDidChangeDevices`, `start()`. A `CompositeDeviceDiscovery` merges Android (`adb track-devices`) and iOS (`simctl list devices booted -j`, polled every 2 s only while something needs it, or `simctl` notifications if the builder finds a reliable stream).
- **`IPlatform`** (Abstract Factory): one per platform, resolved from `device.platform` by a `PlatformRegistry`. Creates the per-device adapters below. This is the **only** place platform branching happens.
- **`IMirrorSession`** (already exists, kept): `start`, `requestKeyframe`, video/state/clipboard events, `control`.
- **`IDeviceControl`**, made platform-neutral: `touch`, `scroll`, `pinch`, `key`, `text`, `paste`, `pressButton(button: HardwareButton)`, `rotate()`. `HardwareButton` is a union (`'home' | 'back' | 'recents' | 'lock' | 'volumeUp' | 'volumeDown' | 'siri' | 'shake' | 'screenPower'`). Android maps them to key codes; iOS to Indigo/notify events.
- **`PlatformCapabilities`**: a declarative description of which toolbar actions, Tools tabs and Actions tiles a device supports. The webview and Tools panel render from it. No platform checks in UI code.
- **Per-tab sources**, one interface each: `ILogSource`, `IPerformanceSource`, `IDeviceInfoSource`, `IAppActions` (+ `IAppActionsSnapshot`), `IAppSandbox` (iOS only for now), `IUserDefaultsStore` (iOS only). Metro-based tabs (Component, Network, AsyncStorage) stay shared; only `selectTarget` must match by the simulator's name as well as the Android model.
- **`IMetroBridge`**: today `reverseMetro` runs `adb reverse`. On iOS it is a no-op (`localhost` reaches Metro), declared through capabilities so the toolbar hides it.

Migration rule: move existing Android code behind these ports **without behaviour change first** (slice 1a), verified by the existing test suite staying green at 100%. Only then add iOS.

### 5.3 The iOS helper: `reflect-sim-helper`

A small Swift command-line executable, one process per mirrored simulator, spawned and owned by `HelperMirrorSession`.

**Source and build:** `native/ios-helper/` as a Swift package (macOS 14+ deployment target, arm64 + x86_64 universal, ad-hoc signed). Built by a script (`npm run build:ios-helper`) on macOS; the binary lands in `assets/ios-helper/reflect-sim-helper` and ships in the VSIX. Not built or needed on Linux/Windows.

**Internal structure** (Swift, same SOLID rules, protocols at every private-API boundary so the logic is unit-testable):

- `XcodeEnvironment`: resolves the developer dir (`xcode-select -p`), Xcode version and loads the frameworks.
- `SimulatorLocator`: `SimServiceContext` → default device set → device by UDID; checks it is booted.
- `ScreenSource`: finds the framebuffer descriptor, registers screen callbacks, exposes frames (retaining the descriptor), unregisters on stop.
- `FrameCopier`: copies the IOSurface into a pooled `CVPixelBuffer`.
- `H264Encoder`: VideoToolbox, Baseline, real-time, no reordering, configurable bitrate/fps/max size, on-demand keyframe, SPS/PPS before every keyframe. Only encodes when the screen changed (frame callback) plus a low-rate refresh so a static screen still produces keyframes on request.
- `TouchInjector` (digitizer recipe from §4), `ButtonInjector` (Indigo button and keyboard messages), `NotifyEvents` (Shake, Face ID and other `notifyutil` events via `simctl spawn`), `OrientationController` (GSEvent to `PurpleWorkspacePort`, as baguette does).
- `ProtocolReader` / `ProtocolWriter`: stdio framing (below).
- `CompatibilityProbe`: on start, resolves every symbol and selector it will need and reports a capability list. A missing piece becomes a structured error, never a crash.

**Process protocol** (versioned, documented in `native/ios-helper/PROTOCOL.md`):

- **stdout**, binary frames: `[u8 type][u32 length BE][payload]`.
  - `0x01 hello`: JSON `{ protocol, xcodeVersion, device: { name, pointWidth, pointHeight, scale }, capabilities[] }`.
  - `0x02 video-config`: SPS/PPS + size (maps to the existing `VideoPacket` kind `configuration`).
  - `0x03 video-frame`: `[u8 flags (bit0 keyframe)][u64 pts µs][Annex-B payload]`.
  - `0x04 event`: JSON (`orientation-changed`, `error`, `warning`).
- **stdin**, newline-delimited JSON commands, coordinates in **device points**: `touch {phase, x, y, id}`, `pinch {...}`, `scroll {x, y, dx, dy}` (implemented as a short drag), `key {usage, down}`, `button {name, down}`, `rotate`, `keyframe`, `quality {bitrate, fps, maxSize}`, `stop`.
- **stderr**: human-readable log lines, forwarded to the Reflect output channel.

The TypeScript side owns the policy: mapping DOM `KeyboardEvent.code` to USB HID usages, converting webview coordinates to points, building commands. Those parts are pure and covered by the 100% rule. The helper stays dumb.

### 5.4 `simctl` adapter (TypeScript)

Everything that does not need private APIs goes through `xcrun simctl` via a `SimctlRunner` (built on the existing `ExecFileProcessRunner` style). Discovery, boot/shutdown/erase, `openurl`, `push`, `location`, `privacy`, `ui appearance|content_size|increase_contrast`, `status_bar`, `addmedia`, `install`, `keychain add-root-cert`, `get_app_container`, `listapps`, `launch`/`terminate`, `pbcopy`/`pbpaste`, `io screenshot`, `spawn … log stream`, `spawn … notifyutil`, `spawn … defaults`, `icloud_sync`.

## 6. Bring to Reflect (UX)

- The **No device mirrored** view lists devices in groups: physical Android, Android Emulators, iOS Simulators (booted first, then shut-down ones that can be booted). Each row has a platform icon and a **Bring to Reflect** button (or **Boot** for shut-down simulators). The existing device picker and status bar item list them too.
- **Bring to Reflect** on a simulator:
  1. Starts the helper and the mirror.
  2. Gets the Simulator.app window out of the way. Default: hide the Simulator app (`NSRunningApplication.hide` from the helper, which needs no Automation permission). Option `reflect.ios.simulatorWindow`: `hide` (default) | `quit` (quit Simulator.app; booted devices stay booted, to be verified on Xcode 26) | `leave`.
  3. On close, the mirror offers **Show in Simulator** (unhide or `open -a Simulator`).
- Booting a simulator from Reflect boots it headless (`simctl boot`), so no window ever appears.

## 7. Feature parity map

| Existing feature | iOS Simulator |
| --- | --- |
| Mirror, aspect ratio, low latency | Helper H.264 → existing decoder |
| Touch, drag, scroll, pinch | Digitizer recipe; scroll as drag; pinch as two-finger stream |
| Keyboard, special keys, shortcuts | DOM code → HID usage (TS), Indigo keyboard messages |
| Clipboard sync | `simctl pbcopy`/`pbpaste`, polling only while mirrored and focused |
| Back / Home / Recents | Back: hidden (no iOS equivalent). Home: Indigo home button. Recents: double home (App Switcher) |
| Rotate | GSEvent orientation |
| Screen off | Lock button (`Lock`) instead |
| Screenshot, MP4 recording | Unchanged (same H.264 stream) + full-resolution `simctl io screenshot` |
| Device frame, 1:1 zoom | Frame per device family with Dynamic Island / notch / home button; points vs pixels for 1:1 |
| Auto-reconnect | Helper restart on crash; simulator shutdown → "Simulator was shut down" + Boot button |
| Reload / Dev Menu | Metro reload as today; Dev Menu via Shake or Metro |
| Reverse Metro | Hidden (not needed) |
| Component inspector, Network, AsyncStorage | Shared Metro path; `selectTarget` matches simulator name |
| Logs | `simctl spawn <udid> log stream --style ndjson` filtered to the foreground app's process, JS logs from React Native's subsystem, levels mapped |
| Device tab | `simctl list -j` (model, runtime, UDID, state), screen size/scale, data size of the device folder |
| Performance | The app runs as a macOS process: CPU and memory from the host (`ps`/`proc_pid_rusage`) for the app's pid. FPS/jank: best effort (see §11) |
| Actions | See §8 |

## 8. iOS extras (all in scope)

**Device and toolbar**
- Simulator manager: list all simulators, boot, shut down, Erase All Content and Settings (asks first).
- Hardware buttons: Home, Lock, Siri, volume up/down, Shake.
- Face ID / Touch ID: enroll, matching face, non-matching face (`notifyutil` BiometricKit events, to be verified).
- Device frames per model.

**Captures**
- Clean status bar for App Store screenshots (9:41, full battery, full signal): toggle via `simctl status_bar override/clear`.
- Drag and drop onto the mirror: `.app` → install; images/videos → `addmedia`; `.mobileconfig`/certificates → keychain where applicable.

**Actions tab (iOS)**
- Push notification: JSON payload editor with bundle id, templates and history (`simctl push`).
- Location: paste coordinates, search a place (no network service: coordinates or a small built-in city list), routes (`simctl location start` with waypoints and speed), clear.
- Deep links / universal links with recent history (shared with Android's history).
- Permissions: grant/revoke/reset per service (`simctl privacy`), grouped like Android.
- Appearance: dark mode, Dynamic Type size, increase contrast.
- Simulate memory warning, iCloud sync, background fetch (if a `simctl`/`notifyutil` path exists on Xcode 26; otherwise hidden).
- Proxy certificate: install a root certificate (Charles/Proxyman) with one click (`simctl keychain add-root-cert`).
- App: restart, clear data (empties the data container, asks first), open settings, language (relaunch with `-AppleLanguages`).

**Storage**
- **Sandbox browser:** the app's data container lives on the Mac (`get_app_container … data`), so Reflect lists `Documents`, `Library`, `Caches`, `tmp` and opens files directly in VS Code.
- **UserDefaults editor:** read `Library/Preferences/<bundle-id>.plist` (`plutil -convert json`), edit and write through `simctl spawn defaults` so `cfprefsd` stays consistent. Works for native Swift apps too, not only React Native.

**Logs**
- Crash reports: watch `~/Library/Logs/DiagnosticReports/*.ips` for the app's process, show them in the Logs tab with the stack trace.

**Side by side**
- Two mirrors at once (e.g. iPhone + Android) in the side bar, each with its own toolbar. The Tools panel follows the focused mirror.

## 9. Delivery slices

Each slice is releasable on its own and keeps CI green at 100% coverage.

1. **Foundation**
   - 1a. Refactor: introduce `Device`, `IPlatform`, `PlatformRegistry`, `PlatformCapabilities`, neutral `IDeviceControl`; move Android code behind them. No behaviour change.
   - 1b. Helper: Swift package, protocol, capture, encoder, touch, buttons, keyboard, orientation, compatibility probe, build script, packaging.
   - 1c. iOS discovery, Bring to Reflect, mirror and control, Simulator.app hiding, errors.
2. **Toolbar and captures:** screenshot, recording, frames, clean status bar, drag and drop.
3. **Metro tools:** Component, Network, AsyncStorage on iOS (`selectTarget`), Reload/Dev Menu.
4. **iOS tools:** Logs + crash reports, Device, Performance, sandbox browser, UserDefaults editor.
5. **iOS Actions:** everything in §8 Actions plus simulator manager and Face ID.
6. **Side by side:** multiple simultaneous mirrors.
7. **Android Emulator:** discovery as `kind: 'emulator'`, Bring to Reflect hides the emulator window, emulator-specific tiles (e.g. `adb emu geo fix`, battery via emulator console) where cheap.

## 10. Packaging and CI

- New macOS CI job builds the helper (`swift build -c release --arch arm64 --arch x86_64`), runs the Swift unit tests and uploads the binary as an artifact. The ubuntu packaging jobs (CI artifact and release) download it into `assets/ios-helper/` before `vsce package`, so the single universal VSIX contains it.
- The extension checks the helper's presence and executable bit at runtime. On non-macOS hosts iOS discovery is never started.
- `THIRD_PARTY_NOTICES.md` gains idb (MIT) and baguette (Apache-2.0).
- **Signing (owner's decision):** there is no Apple Developer ID, so the helper is **ad-hoc signed only**. Clearing the quarantine attribute at runtime (`com.apple.quarantine`, via `xattr -d` before the first spawn, covered by tests) is part of the main path, not a fallback. Before the first release that ships the helper, install the VSIX from the Marketplace on a clean Mac and confirm the helper runs. Notarization is not planned.
- **Identity (owner's decision):** the extension ID stays `reflect-android` (same `name`, `publisher`, command and setting ids) so current users get the update. Only `displayName`, `description`, `keywords` and the README change, e.g. "Reflect — Android & iOS Simulator". New settings and commands use the existing `reflect.` prefix (`reflect.ios.*` for iOS-only ones).

## 11. Risks

| Risk | Mitigation |
| --- | --- |
| Xcode update breaks private symbols | `CompatibilityProbe` + structured error; Android unaffected; doc lists tested Xcode versions; quick-fix releases |
| Gatekeeper/quarantine blocks the bundled binary | Ad-hoc signed, quarantine cleared at runtime, Marketplace install verified before release (§10) |
| iOS FPS/jank has no clean source | Show CPU/memory; FPS only if a reliable source is found (e.g. React Native perf monitor via Metro); otherwise the rows are hidden on iOS |
| Unverified `notifyutil` events (Face ID, memory warning, background fetch) on Xcode 26 | Each tile is behind a capability probe; tiles that do not work are hidden, not broken |
| Keyboard layouts beyond US | Text typed through HID usages works for US layout; non-ASCII text goes through `pbcopy` + paste |
| Coverage rule vs native code | 100% applies to TypeScript; Swift pure logic (framing, parsing, mapping, encoder config) gets unit tests; the private-API layer gets a manual verification checklist |

## 12. Decisions taken by the designer (not discussed with the owner; flag if wrong)

- **Supported Xcode: 26.x and newer only.** One recipe per subsystem (the §4 recipes). Older Xcodes get the "not supported" message from the `CompatibilityProbe`. Recipes are still behind a `Strategy` interface so a future Xcode can get its own without touching callers.
- **Release pipeline:** the release workflow gets a macOS job that builds and tests the helper from the tagged commit and hands the binary to the ubuntu packaging job (`needs:` + artifact). CI does the same on every push. Never reuse a binary from another run.
- **Side by side:** one sidebar webview renders N mirrors stacked (no extra contributed views). From slice 1a the host↔webview protocol carries a `deviceId` on every message, so slice 6 adds no protocol churn. Global commands (`reflect.action.*`, shortcuts, status bar) target the **focused** mirror (last one clicked or typed into); `MirrorManager` tracks focus instead of "latest". Two Android devices at once is allowed by the same mechanism.
- **Target app on iOS:** the Tools panel header gets an app selector. Default target is, in order: the app connected to Metro (its bundle id), else the last chosen app for that simulator (workspace state), else none (the tabs show "Pick an app"). The list comes from `simctl listapps` (user apps) and running ones are marked using `simctl spawn <udid> launchctl list` (`UIKitApplication:<bundle-id>` entries). No private API for foreground detection. Logs, Performance, sandbox, UserDefaults, push and app actions all use this target.
- **Hiding Simulator.app hides all its windows.** Accepted: the default `hide` hides the whole app; README documents it, and **Show in Simulator** unhides it. Per-window hiding (Accessibility permission) is out of scope.

## 13. Left to the builder

- Exact type and file names, and how far to split `extension.ts` wiring (a composition helper per platform is welcome).
- Polling vs notification for simulator discovery.
- Swift package layout and test framework (Swift Testing or XCTest).
- Frame pacing details, default bitrate and max size for the helper (start from today's `MIRROR_OPTIONS`).
- Device frame artwork source (draw them as SVG; do not copy Apple's bezels).
