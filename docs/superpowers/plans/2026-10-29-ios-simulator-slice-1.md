# iOS Simulator — Slice 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A booted iOS Simulator appears in Reflect, **Bring to Reflect** mirrors it in the side bar (Simulator.app hidden), and it can be fully controlled with mouse and keyboard — with Android behaving exactly as before.

**Architecture:** First move the existing Android code behind platform-neutral ports (`Device`, `IPlatform`, `PlatformRegistry`, `PlatformCapabilities`, neutral `IDeviceControl`) with no behaviour change. Then add a Swift helper (`reflect-sim-helper`) that streams H.264 from the simulator framebuffer and injects HID input over a framed stdio protocol. Finally add the iOS adapters in TypeScript (`simctl` discovery, helper-backed mirror session, iOS control) and the Bring to Reflect UX.

**Tech Stack:** TypeScript 5 / VS Code 1.106 API / Vitest (100% coverage) / esbuild; Swift 6.3 package (macOS 14+, arm64 + x86_64) with VideoToolbox, CoreSimulator and SimulatorKit loaded at runtime; `xcrun simctl`.

**Spec:** `docs/superpowers/specs/2026-10-29-ios-simulator-design.md` (§4, §5, §6, §9 slice 1, §10, §12). Slices 2–7 get their own plans.

## Global Constraints

- 100% line/branch/function/statement coverage on `src/**/*.ts` (`npm run coverage` fails below). Every TS task ends with `npm run typecheck && npm run coverage` green.
- `src/extension.ts` is the only composition root; concrete classes are only `new`ed there.
- No platform `if`s outside `PlatformRegistry` / platform adapters / `extension.ts` wiring (anti-goal §2).
- Android behaviour must not change. The existing test suite stays green throughout slice 1a; tests change only for renames/signatures.
- Extension ID stays `reflect-android`; `name`, `publisher`, command and setting ids unchanged. New settings use `reflect.ios.*`.
- iOS code only runs on macOS (`process.platform === 'darwin'`). Supported Xcode: 26.x and newer; older → "not supported" message.
- Helper: ad-hoc signed; quarantine (`com.apple.quarantine`) cleared before first spawn. No `brew` dependency.
- Licenses: recipes adapted from facebook/idb (MIT) and luispadron/baguette (Apache-2.0) are credited in source and in `THIRD_PARTY_NOTICES.md`.
- Commits: conventional (`feat:`, `refactor:`, `test:`, `docs:`, `ci:`), **no** `Co-Authored-By` lines (owner's global rule).
- Coordinates on the helper wire are **device points**; webview coordinates are normalized `[0,1]`.

## Review Focus

1. **Simulator shut down while mirrored** → the mirror shows "Simulator was shut down" (state `disconnected`) and comes back by itself when the simulator is booted again (AutoReconnect via discovery). Test in Task 11.
2. **Two simulators with the same name on different runtimes** (e.g. two "iPhone 15") → both listed and distinguishable (runtime in the label/detail), ids are UDIDs. Test in Task 10.
3. **Helper binary missing or not executable** (dev build without `npm run build:ios-helper`) → `IosHelperUnavailableError` presented by `ErrorPresenter`, no crash, Android unaffected. Test in Task 11.
4. **Non-ASCII typing** (`ç`, `ã`, emoji — the owner types Portuguese) → goes through `simctl pbcopy` + Cmd+V instead of HID usages. Test in Task 12.
5. **Xcode missing or `xcode-select` pointing at CommandLineTools** → simulator discovery yields no devices and logs once; Android discovery unaffected. Test in Task 10.

---

## File map

**Slice 1a (refactor)**
- Create `src/devices/types.ts` — `Device`, `Platform`, `DeviceKind`, `DeviceState`, `IDeviceDiscovery`, `deviceLabel`.
- Create `src/devices/CompositeDeviceDiscovery.ts` — merges discoveries.
- Create `src/platform/types.ts` — `IPlatform`, `PlatformCapabilities`, `HardwareButton`.
- Create `src/platform/PlatformRegistry.ts`.
- Create `src/platform/android/AndroidPlatform.ts` — wraps today's scrcpy session creation and capabilities.
- Create `src/device/PlatformScopedDeviceContext.ts` — decorator for shell-based tabs.
- Rename `src/adb/toDeviceInfo.ts` → `src/adb/toAndroidDevice.ts`.
- Modify: `src/adb/types.ts`, `src/adb/DeviceTracker.ts`, `src/adb/DeviceSelectionService.ts`, `src/device/*`, `src/scrcpy/types.ts`, `src/scrcpy/ControlChannel.ts`, `src/scrcpy/MirrorSession.ts`, `src/actions/*`, `src/mirror/*`, `src/ui/*`, `src/tools/*`, `src/inspector/*` (only `DeviceInfo`→`Device`), `src/shared/protocol.ts`, `src/shared/toolsProtocol.ts`, `src/webview/main.ts`, `src/webview/Toolbar.ts`, `src/toolsWebview/main.ts`, `src/extension.ts`, all matching tests, `test/fakes/devices.ts`.

**Slice 1b (Swift helper)** — `native/ios-helper/`
- `Package.swift`, `PROTOCOL.md`, `Sources/ReflectSimHelper/main.swift`, `Sources/ReflectSimHelperCore/{Protocol,Simulator,Screen,Encoding,Input,App}/…`, `Tests/ReflectSimHelperCoreTests/…`, `Sources/CIndigo/include/Indigo.h`.
- `scripts/build-ios-helper.mjs`, `assets/ios-helper/` (build output, git-ignored).
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `THIRD_PARTY_NOTICES.md`, `.gitignore`.

**Slice 1c (iOS adapters + UX)** — `src/ios/`
- `SimctlRunner.ts`, `parseSimctlDevices.ts`, `SimulatorDiscovery.ts`, `HelperFrameParser.ts`, `HelperProcess.ts`, `HelperMirrorSession.ts`, `IosDeviceControl.ts`, `hidUsages.ts`, `IosPlatform.ts`, `SimulatorAppWindow.ts`, `clearQuarantine.ts`, `types.ts`.
- Modify `src/core/errors.ts`, `src/webview/StatusOverlay.ts`, `src/mirror/mirrorHtml.ts`, `src/ui/QuickPickDevicePicker.ts`, `src/commands/OpenDeviceCommand.ts`, `src/commands/commandIds.ts`, `src/extension.ts`, `package.json`, `README.md`, `CHANGELOG.md`.

---

## Slice 1a — Platform-neutral core (no behaviour change)

### Task 1: `Device` model replaces `DeviceInfo`

**Files:**
- Create: `src/devices/types.ts`
- Rename+modify: `src/adb/toDeviceInfo.ts` → `src/adb/toAndroidDevice.ts`
- Modify: every importer of `DeviceInfo` / `deviceLabel` (list via `grep -rln "DeviceInfo\|deviceLabel" src test`)
- Test: `test/adb/toAndroidDevice.test.ts` (renamed), `test/fakes/devices.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Platform = 'android' | 'ios';
  export type DeviceKind = 'physical' | 'emulator' | 'simulator';
  export type DeviceState = 'ready' | 'unauthorized' | 'offline' | 'shutdown';
  export interface Device {
    readonly id: string;          // Android: adb serial. iOS: simulator UDID.
    readonly platform: Platform;
    readonly kind: DeviceKind;
    readonly name: string;        // human label, e.g. "SM F741B", "iPhone 15"
    readonly model: string | undefined;
    readonly detail: string | undefined; // picker detail: Android product, iOS runtime ("iOS 26.5")
    readonly state: DeviceState;
  }
  export interface IDeviceDiscovery extends IDisposable {
    readonly devices: readonly Device[];
    readonly onDidChangeDevices: Event<readonly Device[]>;
    readonly onDidFail: Event<Error>;
    start(): Promise<void>;
  }
  export const deviceLabel = (device: Device): string => device.name;
  export const isReady = (device: Device): boolean => device.state === 'ready';
  ```
  `toAndroidDevice(device: AdbServerClient.Device): Device`. `IDeviceTracker` becomes an alias-free `IDeviceDiscovery` (delete `IDeviceTracker`; `DeviceTracker implements IDeviceDiscovery`). `transportId` is dropped (unused). Test fixture `device(overrides?: Partial<Device>): Device` replaces `deviceInfo()`.

- [ ] **Step 1: Write the failing test** `test/adb/toAndroidDevice.test.ts`
  - `maps a USB phone`: `toAndroidDevice(tangoDevice())` → `{ id: 'R5CX123', platform: 'android', kind: 'physical', name: 'SM F741B', model: 'SM F741B', detail: 'b6qxeea', state: 'ready' }`.
  - `marks emulator serials`: `serial: 'emulator-5554'` → `kind: 'emulator'`.
  - `falls back to the serial as name`: `model: undefined` → `name: 'R5CX123'`.
  - `maps adb states`: `'device'→'ready'`, `'unauthorized'→'unauthorized'`, `'offline'→'offline'`.
- [ ] **Step 2: Run** `npx vitest run test/adb/toAndroidDevice.test.ts` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/devices/types.ts` and `toAndroidDevice`; then replace `DeviceInfo` with `Device` everywhere: `.serial` → `.id`, `state === 'device'` → `isReady(device)`, `deviceLabel` import moves to `src/devices/types.ts`, `QuickPickDevicePicker` uses `description: device.id, detail: device.detail`. Errors keep their constructor params but receive `device.id`. Update tests mechanically (`deviceInfo(` → `device(`).
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage` — Expected: all green, 100%.
- [ ] **Step 5: Commit** `refactor: platform-neutral Device model`

### Task 2: Neutral `IDeviceControl` and toolbar actions

**Files:**
- Create: `src/platform/types.ts` (only `HardwareButton` in this task)
- Modify: `src/scrcpy/types.ts`, `src/scrcpy/ControlChannel.ts`, `src/actions/deviceActions.ts`, `src/mirror/MirrorController.ts` (`mouse-shortcut` handler)
- Test: `test/scrcpy/ControlChannel.test.ts`, `test/actions/deviceActions.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type HardwareButton = 'back' | 'home' | 'recents' | 'menu' | 'lock' | 'volumeUp' | 'volumeDown' | 'siri' | 'shake';
  export interface IDeviceControl {
    touch(input: TouchInput): Promise<void>;
    scroll(input: ScrollInput): Promise<void>;
    key(input: KeyInput): Promise<void>;
    text(text: string): Promise<void>;
    paste(text: string): Promise<void>;
    pressButton(button: HardwareButton): Promise<void>;
    rotate(): Promise<void>;
    setScreenPower(on: boolean): Promise<void>;
  }
  ```
  `press(AndroidKeyCode)`, `back()`, `home()`, `recents()` are removed from the interface. Android mapping in `ControlChannel.pressButton`: `back` → `backOrScreenOn` down/up (today's `back()`), `home` → `AndroidHome`, `recents` → `AndroidAppSwitch`, `menu` → `ContextMenu`, `lock` → `Power`, `volumeUp`/`volumeDown` → `VolumeUp`/`VolumeDown`, `siri`/`shake` → no-op.
- `DEVICE_ACTIONS`: `back|home|recents` → `pressButton(id)`, `devMenu` → `pressButton('menu')`, `reload` fallback sends `key({ action: 'down'|'up', code: 'KeyR', repeat: 0, modifiers: none })` twice (down+up per press) instead of `press(KeyR)`.

- [ ] **Step 1: Write failing tests**
  - `ControlChannel`: `pressButton('home')` writes down+up `AndroidHome`; `pressButton('menu')` → `ContextMenu`; `pressButton('lock')` → `Power`; `pressButton('volumeUp')` → `VolumeUp`; `pressButton('back')` calls `backOrScreenOn` Down then Up; `pressButton('shake')` writes nothing; all no-op without a writer.
  - `deviceActions`: `devMenu` calls `pressButton('menu')`; `reload` with `reloadApp → false` calls `key` 4 times with `code: 'KeyR'` (down, up, down, up).
- [ ] **Step 2: Run** `npx vitest run test/scrcpy/ControlChannel.test.ts test/actions/deviceActions.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** the interface change and mappings above; `MirrorController` `mouse-shortcut` → `pressButton(shortcut)`.
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage` — Expected: green.
- [ ] **Step 5: Commit** `refactor: platform-neutral device control`

### Task 3: `IPlatform`, `PlatformRegistry`, capabilities and `CompositeDeviceDiscovery`

**Files:**
- Modify: `src/platform/types.ts`
- Create: `src/platform/PlatformRegistry.ts`, `src/platform/android/AndroidPlatform.ts`, `src/devices/CompositeDeviceDiscovery.ts`, `src/device/PlatformScopedDeviceContext.ts`
- Modify: `src/extension.ts`, `src/device/ActiveDeviceContext.ts`, `src/adb/DeviceSelectionService.ts`, `src/mirror/types.ts` (`MirrorServices.actions.reverseMetro`)
- Test: `test/platform/PlatformRegistry.test.ts`, `test/platform/android/AndroidPlatform.test.ts`, `test/devices/CompositeDeviceDiscovery.test.ts`, `test/device/PlatformScopedDeviceContext.test.ts`, `test/extension.test.ts`

**Interfaces:**
- Consumes: `Device`, `IDeviceDiscovery` (Task 1), `IMirrorSession` (existing).
- Produces:
  ```ts
  export interface PlatformCapabilities {
    readonly actions: readonly ActionId[];   // toolbar buttons + reflect.action.* commands
    readonly tools: readonly ToolsTab[];     // Tools tabs that may show for this device
  }
  export interface IPlatform {
    readonly id: Platform;
    capabilities(device: Device): PlatformCapabilities;
    createMirrorSession(device: Device): IMirrorSession;
  }
  export class PlatformRegistry {
    constructor(platforms: readonly IPlatform[]);
    get(device: Device): IPlatform;            // throws Error(`No platform for ${device.platform}`)
    capabilities(device: Device): PlatformCapabilities;
  }
  export class CompositeDeviceDiscovery implements IDeviceDiscovery {
    constructor(sources: readonly IDeviceDiscovery[]);
  }
  export class PlatformScopedDeviceContext implements IActiveDeviceContext {
    constructor(inner: IActiveDeviceContext, platform: Platform);
  }
  ```
  `AndroidPlatform` constructor takes `(pool, launcher, serverBinary, options, logger)`; `capabilities()` returns all `ACTION_IDS` and all seven tabs. `CompositeDeviceDiscovery.devices` = concatenation in source order; fires `onDidChangeDevices` when any source fires; `start()` starts all with `Promise.allSettled` and forwards each rejection to `onDidFail` (one failing source never blocks the others). `PlatformScopedDeviceContext.target` / `mirroredDevice` are `undefined` when the inner value is another platform; `devices` filtered to the platform.

- [ ] **Step 1: Write failing tests**
  - Registry: `get` returns the matching platform; throws for an unregistered platform; `capabilities` delegates.
  - Composite: merges `devices` from two fakes; re-fires changes; `start` resolves even when one source rejects and `onDidFail` receives that error.
  - Scoped context: Android target passes through; iOS target → `undefined`; `devices` filtered; `onDidChange` forwarded.
  - AndroidPlatform: capabilities include `reverseMetro` and `logs`; `createMirrorSession` returns a `MirrorSession` for the device.
- [ ] **Step 2: Run** the four new test files — Expected: FAIL.
- [ ] **Step 3: Implement.** In `extension.ts`: `const discovery = new CompositeDeviceDiscovery([tracker])`, `const platforms = new PlatformRegistry([androidPlatform])`, `MirrorController` gets `platforms.get(device).createMirrorSession(device)`; Logs/Performance/Actions/Device tabs get `new PlatformScopedDeviceContext(activeDevice, 'android')`; `reverseMetro` uses `device.id`.
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage` — Expected: green.
- [ ] **Step 5: Commit** `refactor: platform registry, capabilities and composite discovery`

### Task 4: Capabilities and `deviceId` reach the webviews

**Files:**
- Modify: `src/shared/protocol.ts`, `src/mirror/WebviewBridge.ts`, `src/mirror/SwitchableWebviewChannel.ts`, `src/mirror/MirrorController.ts`, `src/mirror/types.ts`, `src/webview/main.ts`, `src/webview/Toolbar.ts`, `src/commands/RunActionCommand.ts`, `src/tools/ToolsViewProvider.ts`, `src/toolsWebview/main.ts`, `src/shared/toolsProtocol.ts`
- Test: matching files under `test/mirror`, `test/webview`, `test/commands`, `test/tools`, `test/toolsWebview`

**Interfaces:**
- Consumes: `PlatformRegistry.capabilities` (Task 3).
- Produces:
  - Wire envelope (spec §12): `export interface MirrorEnvelope<T> { readonly deviceId: string | undefined; readonly message: T }`. `WebviewBridge` is constructed with `deviceId: string | undefined`, posts `{ deviceId, message }` and unwraps incoming envelopes; `IWebviewChannel` stays message-typed so controllers do not change. Webview `main.ts` unwraps and echoes `deviceId` back.
  - New host→webview message `{ type: 'capabilities'; actions: readonly ActionId[] }`, posted by `MirrorController` on `ready`. `Toolbar.setAvailable(actions)` hides buttons not listed (hidden groups collapse).
  - New host→tools message `{ type: 'tabs-available'; tabs: readonly ToolsTab[] }`, posted by `ToolsViewProvider` whenever the active device changes; `TabBar.setAvailable` is applied for each tab (Network/Storage still also require `app-available`).
  - `MirrorServices` gains `capabilities: (device: Device) => PlatformCapabilities`. `MirrorManager.runAction(id)` now returns `'ran' | 'no-mirror' | 'unsupported'` (still acting on the latest mirror; focus tracking is slice 6) and checks the mirror's capabilities first. `RunActionCommand` keeps today's behaviour for `'no-mirror'` and notifies "Not available on this device" for `'unsupported'`.

- [ ] **Step 1: Write failing tests**
  - Bridge: `post(m)` sends `{ deviceId: 'R5CX123', message: m }`; an incoming `{ deviceId, message }` fires `onMessage(message)`.
  - Controller: on `ready` posts `{ type: 'capabilities', actions: [...] }` from services.
  - Toolbar: `setAvailable(['home'])` hides `back` and shows `home`; a group with no visible button is hidden.
  - Tools: active device change posts `tabs-available` with that device's tabs; no device → all tabs.
  - RunActionCommand: unsupported action → notify `'Not available on this device'`.
- [ ] **Step 2: Run** those tests — Expected: FAIL.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage && npm run build` — Expected: green. Manual: F5, mirror an Android phone, every toolbar button and Tools tab still present and working.
- [ ] **Step 5: Commit** `refactor: device capabilities and device id on the webview protocol`

---

## Slice 1b — `reflect-sim-helper` (Swift)

Swift code follows the same rules: one responsibility per type, protocols at every private-API boundary, pure logic unit-tested with Swift Testing. Private-API adapters are verified by the manual checklist in each task (run against a booted simulator). The spike (§4 of the spec) is the reference for every recipe; the spike source is **not** copied wholesale.

### Task 5: Package, wire protocol and build script

**Files:**
- Create: `native/ios-helper/Package.swift`, `native/ios-helper/PROTOCOL.md`, `Sources/ReflectSimHelperCore/Protocol/{Frame.swift,FrameWriter.swift,Command.swift,CommandReader.swift}`, `Sources/ReflectSimHelper/main.swift` (stub: writes `hello` with empty capabilities, exits on `stop`), `Tests/ReflectSimHelperCoreTests/{FrameWriterTests.swift,CommandReaderTests.swift}`, `scripts/build-ios-helper.mjs`
- Modify: `package.json` (script `"build:ios-helper": "node scripts/build-ios-helper.mjs"`), `.gitignore` (`assets/ios-helper/`), `.vscodeignore` (`native/**`)

**Interfaces:**
- Produces (spec §5.3, exact values):
  - stdout frame `[u8 type][u32 length BE][payload]`; types `0x01 hello` (JSON), `0x02 video-config` (`[u16 width BE][u16 height BE][Annex-B SPS+PPS]`), `0x03 video-frame` (`[u8 flags bit0=keyframe][u64 pts µs BE][Annex-B]`), `0x04 event` (JSON).
  - `hello` JSON: `{ "protocol": 1, "xcodeVersion": string, "device": { "name", "pointWidth", "pointHeight", "scale" }, "capabilities": [string] }`.
  - stdin: one JSON object per line. `enum Command { touch(phase: down|move|up, x, y, id), scroll(x, y, dx, dy), key(usage: UInt32, down: Bool), button(name: String, down: Bool), rotate, keyframe, quality(bitrate, fps, maxSize), simulatorApp(action: hide|show), stop }`. Unknown `type` → `event {"type":"warning","message":"unknown command <type>"}`, never a crash.
  - CLI: `reflect-sim-helper --udid <UDID> [--fps 60] [--bitrate 8000000] [--max-size 1920]`.
  - `build-ios-helper.mjs`: on non-darwin prints "skipped (macOS only)" and exits 0; on darwin runs `swift build -c release --arch arm64 --arch x86_64 --package-path native/ios-helper`, copies the binary to `assets/ios-helper/reflect-sim-helper`, `chmod 0755`, `codesign --force --sign - <binary>`.

- [ ] **Step 1: Write failing tests** — `FrameWriterTests`: `hello` frame starts `0x01` + big-endian length of the JSON; `videoFrame(keyframe: true, pts: 1_000_000, payload)` encodes flags `0x01` and pts `00 00 00 00 00 0F 42 40`. `CommandReaderTests`: parses each command type; `{"type":"bogus"}` → `.unknown("bogus")`; malformed JSON → `.invalid`.
- [ ] **Step 2: Run** `swift test --package-path native/ios-helper` — Expected: FAIL (types missing).
- [ ] **Step 3: Implement** frame/command types, `main.swift` stub, `PROTOCOL.md` (exact layout above), build script.
- [ ] **Step 4: Run** `swift test --package-path native/ios-helper && npm run build:ios-helper && echo '{"type":"stop"}' | assets/ios-helper/reflect-sim-helper --udid X | xxd | head -1` — Expected: tests pass; first byte `01`.
- [ ] **Step 5: Commit** `feat(ios-helper): Swift package, wire protocol and build script`

### Task 6: Xcode environment, simulator lookup and compatibility probe

**Files:**
- Create: `Sources/ReflectSimHelperCore/Simulator/{XcodeEnvironment.swift,SimulatorLocator.swift,CompatibilityProbe.swift,ObjCRuntime.swift}`, `Sources/CIndigo/include/Indigo.h` + `module.modulemap` (Indigo structs, MIT notice from idb), `Tests/ReflectSimHelperCoreTests/CompatibilityProbeTests.swift`

**Interfaces:**
- Produces:
  - `struct XcodeEnvironment { let developerDir: String; let version: String }` — `developerDir` from `xcode-select -p`, version from `xcodebuild -version` first line; `static func load(runner: CommandRunning) throws -> XcodeEnvironment`.
  - `protocol SymbolResolving { func symbol(_ name: String, in framework: String) -> UnsafeMutableRawPointer?; func hasClass(_ name: String) -> Bool }` with a `dlopen`/`dlsym` implementation loading `CoreSimulator` (`/Library/Developer/PrivateFrameworks/…`) and `SimulatorKit` (`<developerDir>/Library/PrivateFrameworks/…`).
  - `CompatibilityProbe.run(resolver:) -> ProbeResult` where `ProbeResult = .supported(capabilities: [String]) | .unsupported(missing: [String])`. Required: classes `SimServiceContext`, `SimulatorKit.SimDeviceLegacyHIDClient`; symbols `IndigoHIDMessageForTrackpadEventFromHIDEventRef`, `IndigoHIDMessageForButton`, `IndigoHIDMessageToCreatePointerService`, `IOHIDEventCreateDigitizerEvent`, `IOHIDEventCreateDigitizerFingerEvent`, `IOHIDEventAppendEvent`. Capabilities: `video`, `touch`, `buttons`, `keyboard`, `orientation`, `simulatorApp`.
  - `SimulatorLocator.device(udid:) throws -> NSObject` using `sharedServiceContextForDeveloperDir:error:` → `defaultDeviceSetWithError:` → `devices` → match `UDID`; errors `HelperError.deviceNotFound`, `.deviceNotBooted(state)`. Selectors called directly (no KVC on ROCK proxies — spec §4.4).
  - `HelperError` is reported as `event {"type":"error","code": "xcode-unsupported"|"device-not-found"|"device-not-booted"|"framework-unavailable","message"}` and exit code 2.
- [ ] **Step 1: Write failing tests** — probe with a fake resolver: all present → `.supported` with the six capabilities; missing `IndigoHIDMessageForTrackpadEventFromHIDEventRef` → `.unsupported(missing: ["IndigoHIDMessageForTrackpadEventFromHIDEventRef"])`.
- [ ] **Step 2: Run** `swift test --package-path native/ios-helper` — FAIL.
- [ ] **Step 3: Implement**; `main.swift` now loads the environment, probes, locates the device and writes a real `hello` (point size and scale from `deviceType.mainScreenSize/mainScreenScale`).
- [ ] **Step 4: Verify** tests pass; manual: with iPhone 15 booted, `echo '{"type":"stop"}' | reflect-sim-helper --udid <UDID>` prints a `hello` with `pointWidth: 393, pointHeight: 852, scale: 3`; with a shut-down UDID → `device-not-booted` event, exit 2.
- [ ] **Step 5: Commit** `feat(ios-helper): Xcode environment, simulator lookup and compatibility probe`

### Task 7: Screen capture and H.264 encoding

**Files:**
- Create: `Sources/ReflectSimHelperCore/Screen/{ScreenSource.swift,FrameCopier.swift}`, `Sources/ReflectSimHelperCore/Encoding/{H264Encoder.swift,AnnexB.swift,EncoderSettings.swift}`, `Tests/…/{AnnexBTests.swift,EncoderSettingsTests.swift}`

**Interfaces:**
- Produces:
  - `protocol ScreenSource { func start(onFrame: @escaping (IOSurface) -> Void) throws; func stop() }` — production impl finds the `com.apple.framebuffer.display` port with a `descriptor` responding to `framebufferSurface`, **retains** the descriptor, registers `registerScreenCallbacksWithUUID:callbackQueue:frameCallback:surfacesChangedCallback:propertiesChangedCallback:`, unregisters with `unregisterScreenCallbacksWithUUID:` (spec §4.2, §4.5).
  - `FrameCopier.copy(_ surface: IOSurface, into pool: CVPixelBufferPool) -> CVPixelBuffer?` — row-by-row copy (spec §4.3; never wrap the live surface).
  - `EncoderSettings(fps: Int, bitrate: Int, maxSize: Int)`, `func outputSize(for: CGSize) -> CGSize` — scales so the longest side ≤ `maxSize`, rounds both sides down to even.
  - `H264Encoder`: Baseline, `RealTime`, no frame reordering, `MaxKeyFrameInterval = fps * 2`; `requestKeyframe()` sets `kVTEncodeFrameOptionKey_ForceKeyFrame` on the next frame; emits `video-config` whenever SPS/PPS or size change, then `video-frame`s. Encodes on frame callbacks, throttled to `fps`; when idle for 1 s it re-encodes the last copied frame so keyframe requests on a static screen are answered.
  - `AnnexB.fromAVCC(_ data: Data, nalLengthSize: Int = 4) -> Data`.
- [ ] **Step 1: Write failing tests** — `AnnexB`: two AVCC NALs → two start-code-prefixed NALs; truncated length → stops without crashing. `EncoderSettings`: `1179×2556, maxSize 1920` → `884×1920` (even); `maxSize 4000` → `1178×2556`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** and wire into `main.swift` (start capture after `hello`; `keyframe` and `quality` commands).
- [ ] **Step 4: Verify** tests pass; manual: `reflect-sim-helper --udid <UDID> > /tmp/out.bin` for 5 s while navigating Settings in Simulator.app; a tiny script (`native/ios-helper/Scripts/extract-h264.mjs`, dev-only) converts frames to `.h264`; `ffprobe -count_frames` reports ≥ 100 frames and `ffmpeg` frames show the navigation (not frozen).
- [ ] **Step 5: Commit** `feat(ios-helper): framebuffer capture and H.264 encoding`

### Task 8: Input — touch, buttons, keyboard, orientation, Simulator.app window

**Files:**
- Create: `Sources/ReflectSimHelperCore/Input/{HIDClient.swift,TouchInjector.swift,DigitizerMessage.swift,ButtonInjector.swift,KeyboardInjector.swift,NotifyEvents.swift,OrientationController.swift,InputDispatcher.swift}`, `Sources/ReflectSimHelperCore/App/SimulatorAppWindow.swift`, `Tests/…/{InputDispatcherTests.swift,DigitizerMessageTests.swift}`

**Interfaces:**
- Produces:
  - `protocol InputSink { func touch(_ phase: TouchPhase, at: CGPoint, id: UInt32); func scroll(at: CGPoint, dx: Double, dy: Double); func key(usage: UInt32, down: Bool); func button(_ name: ButtonName, down: Bool); func rotate() }`.
  - `InputDispatcher(sink: InputSink, pointSize: CGSize)` maps `Command`s to the sink; clamps points to `[0, pointSize]`; `scroll` becomes a 6-step drag of `dy` points starting at `(x, y)` with its own touch id; `button` names: `home`, `lock`, `volumeUp`, `volumeDown`, `siri`, `shake`, `appSwitcher`; unknown name → warning event.
  - `DigitizerMessage.patch(_ raw: UnsafeMutableRawPointer, size: Int)` writes `0x32` at `0x6c` and (if `size >= 0x110`) `0x10c`; zeroes `0x3a, 0x3b, 0xda, 0xdb` when present (spec §4.1, credited to baguette).
  - `TouchInjector` (digitizer recipe, warm-up pointer + mouse services once), `ButtonInjector` (`IndigoHIDMessageForButton`; `appSwitcher` = two home presses 150 ms apart), `KeyboardInjector` (Indigo keyboard: source `0x2710`, target `0x64`), `NotifyEvents.shake()` (`xcrun simctl spawn <udid> notifyutil -p com.apple.UIKit.SimulatorShake`), `OrientationController.rotate()` (GSEvent to `PurpleWorkspacePort`, cycling portrait → landscapeLeft → portraitUpsideDown → landscapeRight; emits `event {"type":"orientation-changed","orientation"}`).
  - `SimulatorAppWindow.hide()` / `.show()` via `NSRunningApplication` for bundle id `com.apple.iphonesimulator` (no-op when not running).
- [ ] **Step 1: Write failing tests** — dispatcher with a recording fake sink: `touch` forwarded with same id; point `(500, -3)` on `393×852` clamps to `(393, 0)`; `scroll dy=-120` produces down, ≥ 6 moves, up with one id; `button {"name":"bogus"}` → warning. `DigitizerMessage.patch` on a zeroed 0x180-byte buffer sets the four target bytes and leaves edge bytes 0.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; dispatch input on the main thread (`DispatchQueue.main`) — `IndigoHID*` builders read AppKit thread state.
- [ ] **Step 4: Verify** tests pass; manual checklist on iPhone 15: tap opens Settings → General; scroll moves the list; typing `abc` in the Settings search field; Home returns to SpringBoard; Lock locks; rotate turns the UI; shake shows "Shake to undo" in Notes; `{"type":"simulatorApp","action":"hide"}` hides Simulator.app.
- [ ] **Step 5: Commit** `feat(ios-helper): touch, buttons, keyboard, rotation and Simulator window control`

### Task 9: CI, release packaging and notices

**Files:**
- Modify: `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md` (iOS helper section: `npm run build:ios-helper`, manual checklist)

**Interfaces:**
- Produces: job `ios-helper` (`runs-on: macos-latest`): `swift test --package-path native/ios-helper`, `npm run build:ios-helper`, upload artifact `ios-helper` (`assets/ios-helper/reflect-sim-helper`). Every job that runs `vsce package` (`build` on ubuntu in CI, `release`) `needs: ios-helper`, downloads the artifact into `assets/ios-helper/` and `chmod +x` before packaging. Release builds the helper from the tagged commit (spec §12). `THIRD_PARTY_NOTICES.md` adds idb (MIT) and baguette (Apache-2.0) with their license texts.
- [ ] **Step 1: Implement** workflow changes.
- [ ] **Step 2: Verify** push the branch; CI green on all three OSes; the ubuntu VSIX artifact contains `extension/assets/ios-helper/reflect-sim-helper` (`unzip -l reflect-android.vsix | grep reflect-sim-helper`).
- [ ] **Step 3: Commit** `ci: build the iOS helper on macOS and ship it in the VSIX`

---

## Slice 1c — iOS adapters and Bring to Reflect

### Task 10: `simctl` runner and simulator discovery

**Files:**
- Create: `src/ios/types.ts`, `src/ios/SimctlRunner.ts`, `src/ios/parseSimctlDevices.ts`, `src/ios/SimulatorDiscovery.ts`
- Modify: `src/extension.ts` (add `SimulatorDiscovery` to `CompositeDeviceDiscovery` only on darwin)
- Test: `test/ios/parseSimctlDevices.test.ts`, `test/ios/SimctlRunner.test.ts`, `test/ios/SimulatorDiscovery.test.ts`, `test/ios/fixtures.ts` (real `simctl list devices -j` output captured from the owner's machine, trimmed)

**Interfaces:**
- Produces:
  ```ts
  export interface ISimctl {
    run(args: readonly string[], input?: string): Promise<string>;   // xcrun simctl <args>
  }
  export const parseSimctlDevices = (json: string): readonly Device[];
  export class SimulatorDiscovery implements IDeviceDiscovery {
    constructor(simctl: ISimctl, logger: ILogger, intervalMs: number);
  }
  ```
  Parse rules: only `isAvailable` devices of `com.apple.CoreSimulator.SimRuntime.iOS-*` runtimes; `id` = `udid`, `platform 'ios'`, `kind 'simulator'`, `name` = device name, `model` = device name, `detail` = runtime as `"iOS 26.5"`, `state` `Booted → 'ready'`, anything else → `'shutdown'`. Order: ready first, then by name. `SimulatorDiscovery` polls `list devices -j` every `intervalMs` (2000) while it has listeners, fires only when the list changed (compare ids+states), logs the first failure once and reports `[]` (Review Focus 5). `SimctlRunner` uses `execFile('xcrun', ['simctl', ...args])` with a 15 s timeout and writes `input` to stdin when given.
- [ ] **Step 1: Write failing tests** — fixture parse: iPhone 15 booted → ready device with `detail 'iOS 26.5'`; watchOS runtime ignored; two "iPhone 15" on different runtimes → two devices, distinct ids and details (Review Focus 2). Discovery: fires once for identical polls; fires on state change; `run` rejecting → `devices` empty, logger called once across two failures.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; wire in `extension.ts` behind `process.platform === 'darwin'`.
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage` — green. Manual: F5, booted iPhone 15 appears in **Reflect: Open Device** picker with detail "iOS 26.5".
- [ ] **Step 5: Commit** `feat(ios): discover booted iOS Simulators with simctl`

### Task 11: Helper process and `HelperMirrorSession`

**Files:**
- Create: `src/ios/HelperFrameParser.ts`, `src/ios/HelperProcess.ts`, `src/ios/clearQuarantine.ts`, `src/ios/HelperMirrorSession.ts`
- Modify: `src/core/errors.ts`
- Test: `test/ios/HelperFrameParser.test.ts`, `test/ios/HelperProcess.test.ts`, `test/ios/HelperMirrorSession.test.ts`, `test/fakes/FakeHelperProcess.ts`

**Interfaces:**
- Consumes: wire protocol (Task 5), `IMirrorSession`/`IDeviceControl` (Task 2).
- Produces:
  ```ts
  export type HelperFrame =
    | { kind: 'hello'; hello: HelperHello }
    | { kind: 'video-config'; width: number; height: number; data: Uint8Array }
    | { kind: 'video-frame'; keyframe: boolean; pts: number; data: Uint8Array }
    | { kind: 'event'; event: HelperEvent };
  export class HelperFrameParser { push(chunk: Uint8Array): HelperFrame[] }   // handles frames split across chunks
  export interface IHelperProcess extends IDisposable {
    readonly onFrame: Event<HelperFrame>;
    readonly onExit: Event<{ code: number | null }>;
    send(command: HelperCommand): void;      // JSON line on stdin
  }
  export type HelperProcessFactory = (udid: string) => Promise<IHelperProcess>;
  export class HelperMirrorSession implements IMirrorSession {
    constructor(device: Device, spawn: HelperProcessFactory, createControl: (send: (c: HelperCommand) => void, hello: HelperHello) => IDeviceControl, logger: ILogger);
  }
  ```
  New errors in `src/core/errors.ts`: `IosHelperUnavailableError` (code `ios-helper-unavailable`, path), `XcodeUnsupportedError` (code `xcode-unsupported`, xcodeVersion, missing[]), `SimulatorNotBootedError` (code `simulator-not-booted`, name). `ErrorPresenter` maps them to user text: "Reflect's iOS helper is missing. Reinstall the extension.", "Xcode {version} is not supported yet by Reflect.", "{name} is not booted.".
  Session behaviour: `start()` → `connecting`; `hello` → stores it; `video-config` → `onDidChangeVideoConfig({ codec: H264, width, height })` and a `configuration` `VideoPacket`; `video-frame` → `data` packet (`keyframe`, `pts`) and state `streaming` on the first one; `error` event with code `xcode-unsupported`/`device-not-booted` → reject start with the matching error; process exit while streaming → `disconnected` (AutoReconnect then restarts once discovery reports the device ready again — Review Focus 1); `requestKeyframe` → `{type:'keyframe'}`; `dispose` → `{type:'stop'}` then kills after 1 s. `onDeviceClipboard`: polls `simctl pbpaste` every 1 s while streaming and fires when the text changes. Process factory: checks the helper file exists and is executable (else `IosHelperUnavailableError` — Review Focus 3), runs `clearQuarantine(path)` (`xattr -d com.apple.quarantine`, ignoring "No such xattr"), spawns with `--udid`, `--fps 60`, `--bitrate 8000000`, `--max-size 1920` (today's `MIRROR_OPTIONS`), forwards stderr lines to the logger as `[ios-helper] …`.
- [ ] **Step 1: Write failing tests** — parser: one frame split over three chunks → one `video-frame`; two frames in one chunk → two. Session (fake process): hello + config + frame → `streaming` and two packets; error event `device-not-booted` → `start()` rejects `SimulatorNotBootedError`; exit after streaming → `disconnected`; dispose sends `stop`. Factory: missing file → `IosHelperUnavailableError`; quarantine cleared before spawn.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage` — green.
- [ ] **Step 5: Commit** `feat(ios): helper process and iOS mirror session`

### Task 12: `IosDeviceControl` and `IosPlatform`

**Files:**
- Create: `src/ios/hidUsages.ts`, `src/ios/IosDeviceControl.ts`, `src/ios/IosPlatform.ts`
- Modify: `src/extension.ts` (register `IosPlatform` on darwin)
- Test: `test/ios/hidUsages.test.ts`, `test/ios/IosDeviceControl.test.ts`, `test/ios/IosPlatform.test.ts`

**Interfaces:**
- Consumes: `HelperCommand`, `HelperHello` (Task 11), `ISimctl` (Task 10).
- Produces:
  - `toHidUsage(code: string): number | undefined` — DOM `KeyboardEvent.code` → USB HID page 7 usage (`KeyA`=4…`KeyZ`=29, `Digit1`=30…`Digit0`=39, `Enter`=40, `Escape`=41, `Backspace`=42, `Tab`=43, `Space`=44, punctuation 45–56, arrows 79–82, `ShiftLeft`=225, `MetaLeft`=227, etc.). `charToKeystroke(char: string): { usage: number; shift: boolean } | undefined` for printable US-ASCII.
  - `IosDeviceControl implements IDeviceControl` (constructed with `send`, `hello`, `simctl`, `udid`): `touch` converts normalized → points (`x * hello.device.pointWidth`), `primary` pointer id 1 / `virtual` id 2; `scroll` → `{type:'scroll', x, y, dx, dy}` with wheel deltas × 40 points; `key` → `{type:'key', usage, down}` (+ modifier usages); `text(t)`: all chars ASCII-mappable → keystrokes; otherwise `simctl pbcopy <udid>` with `t` then Cmd+V (Review Focus 4); `paste(t)` → `pbcopy` + Cmd+V; `pressButton`: `home`→`home`, `recents`→`appSwitcher`, `menu`/`shake`→`shake`, `lock`/`volumeUp`/`volumeDown`/`siri` → same name, `back` → no-op; `rotate` → `{type:'rotate'}`; `setScreenPower(false)` → `lock`, `true` → `home`.
  - `IosPlatform implements IPlatform`: capabilities `actions: ['home', 'recents', 'rotate', 'screenPower', 'screenshot', 'record', 'devMenu', 'reload']` (no `back`, no `reverseMetro` — spec §7), `tools: ['component', 'network', 'storage']` (shell-based tabs arrive in slice 4); `createMirrorSession(device)` → `HelperMirrorSession` with `IosDeviceControl`.
- [ ] **Step 1: Write failing tests** — `toHidUsage('KeyA') === 4`, `('Enter') === 40`, `('F13') === undefined`; `charToKeystroke('A')` → `{ usage: 4, shift: true }`. Control: touch `(0.5, 0.5)` on 393×852 → `{ x: 196.5, y: 426 }`; `text('olá')` calls `simctl.run(['pbcopy', udid], 'olá')` then sends Meta down, V down/up, Meta up; `text('ok')` sends four key commands, no pbcopy; `pressButton('back')` sends nothing; `setScreenPower(false)` sends lock down/up. Platform: capabilities exclude `back` and `reverseMetro` and `logs`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; register in `extension.ts` on darwin.
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage` — green. Manual: F5 → Open Device → iPhone 15 → mirror streams; tap, scroll, type "olá" in Notes, Home, rotate; toolbar shows no Back and no Reverse Metro; Tools shows Component/Network/Storage only.
- [ ] **Step 5: Commit** `feat(ios): control and platform for iOS Simulators`

### Task 13: Bring to Reflect UX, Simulator.app window and identity

**Files:**
- Create: `src/ios/SimulatorAppWindow.ts`, `src/commands/BootSimulatorCommand.ts`, `src/commands/ShowInSimulatorCommand.ts`
- Modify: `src/shared/protocol.ts`, `src/webview/StatusOverlay.ts`, `src/mirror/mirrorHtml.ts`, `src/mirror/MirrorViewProvider.ts`, `src/ui/QuickPickDevicePicker.ts`, `src/commands/OpenDeviceCommand.ts`, `src/commands/commandIds.ts`, `src/core/errors.ts` (`NoDeviceError` text), `src/extension.ts`, `package.json`, `README.md`, `CHANGELOG.md`
- Test: `test/webview/StatusOverlay.test.ts`, `test/mirror/MirrorViewProvider.test.ts`, `test/ui/QuickPickDevicePicker.test.ts`, `test/commands/OpenDeviceCommand.test.ts`, `test/commands/BootSimulatorCommand.test.ts`, `test/commands/ShowInSimulatorCommand.test.ts`, `test/ios/SimulatorAppWindow.test.ts`

**Interfaces:**
- Consumes: discovery (Task 10), `IosPlatform` (Task 12), helper `simulatorApp` command (Task 8).
- Produces:
  - Host→webview `{ type: 'device-list'; devices: readonly DeviceListItem[] }` with `DeviceListItem = { id, name, detail, platform, kind, state }`, posted by `MirrorViewProvider` to the idle sidebar whenever discovery changes. Webview→host `{ type: 'open-device'; deviceId?: string }` and `{ type: 'boot-device'; deviceId: string }`.
  - `StatusOverlay` idle view: title "No device mirrored", one row per device grouped **Android devices / Android Emulators / iOS Simulators**, row button **Bring to Reflect** (ready) or **Boot** (shutdown); empty list → today's text and **Open Device** button.
  - `OpenDeviceCommand.execute(deviceId?: string)` opens that device directly when given; otherwise the picker. `QuickPickDevicePicker` labels: `$(device-mobile)` Android, `$(vm)` emulator, `$(device-mobile) {name}` with description `iOS Simulator` and detail runtime for iOS; placeholder "Choose the device to mirror". `DeviceSelectionService` offers only `ready` devices (booting happens via **Boot**).
  - `BootSimulatorCommand` (`reflect.bootSimulator`, arg `deviceId`): `simctl boot <udid>` (headless), then `OpenDeviceCommand` once discovery reports it ready (timeout 60 s → error message "The simulator did not finish booting").
  - `SimulatorAppWindow` (TS side): reads `reflect.ios.simulatorWindow` (`hide` default | `quit` | `leave`); on iOS mirror open: `hide` → helper `{type:'simulatorApp', action:'hide'}`, `quit` → `osascript -e 'quit app "Simulator"'`, `leave` → nothing. `ShowInSimulatorCommand` (`reflect.showInSimulator`) → `open -a Simulator`; the idle overlay shows a **Show in Simulator** link after an iOS mirror closes while hidden.
  - `NoDeviceError` message: "No device connected or simulator booted".
  - `package.json`: `displayName` "Reflect — Android & iOS Simulator", description "Mirror and control Android devices and iOS Simulators inside VS Code. Built for React Native developers.", keywords add `ios`, `ios simulator`, `xcode`, `simulator`; new setting `reflect.ios.simulatorWindow` (enum `hide|quit|leave`, default `hide`, description "What to do with the Simulator app window when a simulator is brought into Reflect."); new commands `reflect.bootSimulator`, `reflect.showInSimulator` (hidden from palette when not darwin via `when: isMac`). README: new "iOS Simulator" section (requirements: macOS, Xcode 26+; what works in this release; that hiding hides all Simulator windows). CHANGELOG `Unreleased` entry.
- [ ] **Step 1: Write failing tests** — overlay renders three groups and the right button per state, and posts `open-device` with the row id / `boot-device`; provider posts `device-list` on discovery change; picker labels and placeholder; `OpenDeviceCommand.execute('UDID')` skips the picker; boot command calls `simctl boot` then opens when discovery fires ready, and reports the timeout error; `SimulatorAppWindow` sends hide only for iOS devices and respects `leave`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run typecheck && npm run coverage && npm run build` — green.
- [ ] **Step 5: Manual end-to-end (owner's machine)**
  1. Simulator.app open with iPhone 15 booted → Reflect side bar lists it under **iOS Simulators** → **Bring to Reflect** → Simulator.app hides, mirror streams within 2 s.
  2. Tap, scroll, type `olá`, Home, rotate, record 5 s MP4 and take a screenshot (files in `reflect-captures/`).
  3. `xcrun simctl shutdown <udid>` → mirror shows disconnected; `xcrun simctl boot <udid>` → mirror returns by itself.
  4. Shut-down simulator row → **Boot** → boots headless and opens.
  5. Android phone plugged in at the same time → still mirrors normally (open it with the picker).
  6. Close the iOS mirror → **Show in Simulator** brings Simulator.app back.
- [ ] **Step 6: Commit** `feat(ios): bring iOS Simulators into Reflect`

---

## After slice 1

Write the slice 2 plan (toolbar and captures: frames per device family, clean status bar, drag and drop) from spec §9, then slices 3–7.
