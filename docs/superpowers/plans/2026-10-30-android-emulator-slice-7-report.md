# Slice 7 — Android Emulator: Bring to Reflect (#40) — Report

Branch `feat/android-emulator`, based on `feat/ios-simulator` (e3c1ffb), because slice 7 builds on slice 1's platform layer (`src/platform`, `src/devices`, `src/ios`), which `main` does not have yet. Worktree: `/Users/gabrielcordeiro/projects/Cordeiro/Reflect/.claude/worktrees/agent-a6394a274e0d70703`. Nothing pushed or merged, and no other branch was changed.

## What already worked (from slice 1)

- `toAndroidDevice` marks `emulator-*` serials as `kind: 'emulator'`.
- The idle sidebar already groups devices into "Android devices / Android Emulators / iOS Simulators", with **Bring to Reflect** on ready rows. The quick pick shows `$(vm)` for emulators.
- The scrcpy mirror path is the same for emulators and physical devices.

## What I built

1. **`src/emulator/`** (new module)
   - `AdbEmulatorConsole`: runs `<adb> -s <serial> emu <args>` (adb comes from the existing locator), strips the trailing `OK` and rejects on `KO:` replies (the console prints `KO` on stdout and exits 0).
   - `MacAppVisibility`: `NSRunningApplication.hide` / `unhide` by pid, through JavaScript for Automation's ObjC bridge (`osascript -l JavaScript -e <script> hide|unhide <pid>`). This sends no Apple Events, so it needs no Accessibility or Automation permission, and no binary is shipped.
   - `EmulatorWindows`: `hide(serial)` reads `reflect.android.emulatorWindow` (`hide` default | `leave`), skips emulators that are not `windowtype=qtwindow`, gets the pid from `avd discoverypath` (`…/avd/running/pid_<pid>.ini`), hides the app, and logs (rather than throws) on failure. Also `show(serial)` (errors reach the caller), `isHidden`, `onDidChange`, and `retain(ids)` to forget emulators that went away.
2. **`AndroidPlatform`**: takes an `EmulatorWindowHider`. For `kind: 'emulator'` it hides the window the first time the session streams (the subscription is then disposed). `capabilities(device)` returns emulator copy ("Emulator stopped — it will reconnect when it starts again" / "Emulator not found. Start it from Android Studio or with the emulator command."). Same actions and tabs as physical devices. Physical devices behave as before.
3. **Sidebar**: `DeviceListItem.windowHidden?` (optional, so existing payloads stay the same). `MirrorViewProvider` takes a platform-neutral `DeviceWindowState` and posts the list again when it changes. `StatusOverlay` adds a secondary **Show Window** button to hidden rows, which posts `show-device-window` → `reflect.showDeviceWindow` (`ShowDeviceWindowCommand`, hidden from the palette). CSS uses the `--vscode-button-secondary*` tokens.
4. **Composition**: wired in `extension.ts` only. The macOS check is captured once at activation (`hidesEmulatorWindows`); on other OSes the mode is `leave`. `discovery.onDidChangeDevices → emulatorWindows.retain`.
5. **package.json**: command `reflect.showDeviceWindow` and setting `reflect.android.emulatorWindow`.
6. **Docs**: an Android Emulator section in the README (the window behaviour, the setting, a troubleshooting row, the requirements line), which closes #16's "verify and document". CONTRIBUTING lists the `emulator/` module.

## Commits

- c35c4a1 docs: implementation plan for Android Emulator slice 7 (#40)
- 6a1a6f3 feat(emulator): hide and show the Android Emulator window through its console and AppKit
- ab6b22f feat(emulator): hide the emulator window on Bring to Reflect and offer Show Window when the mirror closes
- 1d0606b docs: document Android Emulator support (#40, #16)
- e44b083 refactor(emulator): drop the duplicated window state type

No Co-Authored-By lines.

## Tests / checks

- `npm run coverage`: 132 files, 1070 tests passed. Statements 5026/5026, branches 1896/1896, functions 1554/1554, lines 4622/4622 (100%).
- `npm run typecheck`: exit 0. `npm run build`: done.
- New tests: `test/emulator/{AdbEmulatorConsole,MacAppVisibility,EmulatorWindows}.test.ts` and `test/commands/ShowDeviceWindowCommand.test.ts`. Updated tests: `AndroidPlatform`, `MirrorViewProvider`, `MirrorController`, `StatusOverlay`, webview `main`, and `extension` (darwin hides then Show Window unhides, `leave` mode, Linux never calls the console, subscription count 52 → 55).
- Flakiness: my first extension tests used `flushPromises` and failed once under full-suite load, because the adb locator does real fs I/O. I switched them to `vi.waitFor`; 3 coverage runs in a row were then green. Separately, `extension > skips the clipboard when disabled` failed once in a full run and passed on rerun. That test was already there and is not related to this slice; worth watching.

## Live verification (Small_Phone, API 37 arm64, macOS)

- `adb devices -l`: `emulator-5554 device product:sdk_gphone16k_arm64 …`.
- Project `DeviceTracker` discovered `{"id":"emulator-5554","platform":"android","kind":"emulator","name":"sdk gphone16k arm64",…,"state":"ready"}`.
- A throwaway tsx script (since deleted) used the real `AdbServerGateway` + `DeviceLeasePool` + `AdbScrcpyLauncher` + `FileServerBinary` + `AndroidPlatform` + `EmulatorWindows`:
  - states `connecting → streaming`, video config 720×1280 H.264, 61 packets in 3 s (1 keyframe) after a Home press through `control.pressButton('home')`.
  - The log showed `Emulator window of emulator-5554: hide` at streaming.
  - On-screen windows for the qemu pid, counted with `CGWindowListCopyWindowInfo(OnScreenOnly)`: 2 before mirroring, **0 while mirrored** (`isHidden=true`), **2 after `show()`** (`isHidden=false`). Video kept streaming while the window was hidden.
  - After `dispose()`, `adb shell ps -A` showed no scrcpy process left.
  - No permission prompt at any point.
- Battery: `dumpsys battery unplug; set level 5`, which the existing Actions tab uses, works on the emulator (level 5, not powered). `reset` restores it. So no console-based battery path is needed.
- The emulator was shut down with `adb -s emulator-5554 emu kill`. I did not touch the iOS Simulator and did not run `xcrun simctl`.
- Not verified live: the sidebar webview UI (Show Window button) inside an F5 Extension Development Host. It is covered by unit and extension tests only.

## Decisions

- **Hide mechanism**: the emulator console has no window command (checked `help`, `help-verbose`, `avd help`). NSRunningApplication through JXA is the least invasive option: no permissions, no new binary, and it hides per emulator (one qemu process per AVD), unlike Simulator.app. I did not use the iOS helper, because it is per-simulator and belongs to the other slice.
- **Show again**: a per-row **Show Window** button in the idle device list, rather than a global link like "Show in Simulator", because hiding is per emulator. The Dock icon also unhides it. The window is not auto-shown on close, following spec §6 ("offers").
- Hide happens once per session, at the first `streaming`, so a window the user brings back during a reconnect is not hidden again.
- No `quit` mode for emulators: quitting qemu kills the device.
- Emulator-specific reconnect copy, since "plug the cable back in" made no sense for an emulator.
- Neutral names in the core (`DeviceWindowState`, `show-device-window`, `reflect.showDeviceWindow`). The only `kind === 'emulator'` branches are inside `AndroidPlatform` (the platform adapter).

## Open issues / follow-ups

- **Location tile** (`adb emu geo fix <lon> <lat>`): not done. It needs a new form in the Actions panel, a new action routed to the emulator console instead of the shell, and a per-device capability for Actions tiles. That is not cheap, so it should be its own issue.
- **Battery via emulator console**: not needed. The existing `dumpsys battery` tiles work on emulators (verified).
- **Emulator display name**: rows show the adb model (`sdk gphone16k arm64`). Using `adb emu avd name` (`Small_Phone`) would read better; this needs a name-enriching discovery decorator. Follow-up.
- If the user unhides the emulator from the Dock while it is mirrored, `isHidden` stays true until **Show Window** is clicked (which is then harmless). A per-pid visibility check could fix this later.
- Emulators embedded in Android Studio's Running Devices report `qtwindow` with a hidden Qt window, so hiding is a harmless no-op there and a **Show Window** button may appear. Not verified.
- No live F5 check of the sidebar UI (see above).
