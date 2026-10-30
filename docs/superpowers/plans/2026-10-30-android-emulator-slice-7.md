# Android Emulator — Bring to Reflect (slice 7, #40) — Plan

Spec: `docs/superpowers/specs/2026-10-29-ios-simulator-design.md` §2 (goal 8), §5.2, §6, §9 slice 7. Absorbs #16.

## What already works (slice 1)

- `toAndroidDevice` marks `emulator-*` serials as `kind: 'emulator'`.
- The idle sidebar groups devices by kind, including an **Android Emulators** group with **Bring to Reflect**.
- The scrcpy mirror path is the same for emulators and physical devices.

## Research: hiding the emulator window on macOS

- The emulator console (`adb -s <serial> emu …`) has no window command. It does expose `avd windowtype` (`qtwindow` or headless) and `avd discoverypath` (`…/avd/running/pid_<pid>.ini`), which gives the pid of the `qemu-system-*` process.
- Each emulator runs in its own `qemu-system-*` process, which is a regular `NSRunningApplication`. `NSRunningApplication.hide` / `unhide` work on another app without Accessibility or Automation permissions (they send no Apple Events). They are reachable without shipping a binary through JavaScript for Automation's ObjC bridge: `osascript -l JavaScript -e '<script>' <pid>`.
- Verified on Small_Phone: hide leaves 0 on-screen windows for the pid, unhide brings both windows (device + side toolbar) back, no permission prompt.
- Hiding is per emulator (one process per AVD), unlike Simulator.app.

## Tasks

1. **Emulator console** — `src/emulator/AdbEmulatorConsole.ts` (`IEmulatorConsole.run(serial, args): Promise<string>`): runs `<adb> -s <serial> emu <args>` through the adb locator, returns the reply without the trailing `OK`, rejects on `KO:`.
2. **App visibility** — `src/emulator/MacAppVisibility.ts` (`IAppVisibility.hide(pid)`, `unhide(pid)`): `osascript -l JavaScript` with an `NSRunningApplication` script, through `ProcessRunner`.
3. **Emulator windows** — `src/emulator/EmulatorWindows.ts`: `hide(serial)` (reads `reflect.android.emulatorWindow`: `hide` | `leave`; skips headless emulators; resolves the pid from `avd discoverypath`; logs and swallows failures), `show(serial)`, `isHidden(serial)`, `onDidChange`, `retain(ids)` to forget emulators that went away.
4. **Android platform** — `AndroidPlatform` takes an `EmulatorWindowHider`; for `kind: 'emulator'` it hides the window once the session first streams. Emulator reconnect copy in `capabilities(device)`. Physical devices unchanged.
5. **Sidebar + command** — `DeviceListItem.windowHidden?`, `MirrorViewProvider` takes a platform-neutral `DeviceWindowState` and re-posts the list when it changes; `StatusOverlay` renders a **Show Window** button on hidden rows that posts `show-device-window`; `ShowDeviceWindowCommand` (`reflect.showDeviceWindow`, hidden from the palette). `package.json` setting `reflect.android.emulatorWindow`.
6. **Composition** — wire everything in `extension.ts` (macOS only hides; elsewhere the mode is `leave`), forget emulators that disappear from discovery.
7. **README** — Android Emulator section (closes #16's "verify and document").
8. **Live verification** on Small_Phone: `adb devices`, scrcpy mirror via the project's session classes, hide/show.

## Extras (only if cheap)

- Battery: the Actions tab already sets battery through `dumpsys battery`, which works on emulators — no console path needed. Verify live.
- Location (`emu geo fix`): needs a new form, a new action routed to the console instead of the shell and a per-device capability for Actions tiles. Not cheap; follow-up unless time allows.
- Emulator display name from `avd name` (instead of `sdk gphone64 arm64`): follow-up unless time allows.

## Tests

One test file per new source file under `test/emulator/`, plus updates to `AndroidPlatform`, `MirrorViewProvider`, `StatusOverlay`, `main`, the command and `extension.test.ts`. `npm run coverage` at 100%, `npm run typecheck`, `npm run build`.
