# iOS Simulator — Slice 2 (Toolbar and captures) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-resolution iOS screenshots, a device frame that matches the mirrored iPhone, a one-click clean status bar for App Store screenshots, and drag-and-drop of apps, media and certificates onto the iOS mirror.

**Architecture:** Each feature is declared through `PlatformCapabilities` and implemented behind the existing ports, so the core stays free of platform `if`s. iOS work goes through `ISimctl`; the webview only renders what the host tells it.

**Tech Stack:** TypeScript / VS Code API / Vitest (100% coverage) / esbuild; `xcrun simctl`.

**Spec:** `docs/superpowers/specs/2026-10-29-ios-simulator-design.md` (§7 parity rows "Screenshot, MP4 recording" and "Device frame, 1:1 zoom"; §8 "Captures" and "Device frames per model"; §9 slice 2). Builds on slice 1 (PR #43, branch `feat/ios-simulator`); this plan runs on `feat/ios-simulator-slice-2`.

## Global Constraints

- 100% line/branch/function/statement coverage on `src/**/*.ts`; every task ends with `npm run typecheck && npm run coverage` green and `npm run build` OK.
- `src/extension.ts` is the only composition root. No platform `if`s in the core outside registry/adapters/wiring; platform differences go through `PlatformCapabilities` or `IPlatform`/`IMirrorSession`.
- Android behaviour must not change (its capabilities keep every existing action; new iOS-only actions are not listed for Android).
- Public files in English; no TS code comments; conventional commits; NO `Co-Authored-By`; never push.
- Live checks use the iPhone 15 simulator `BDAE45E9-4A82-4ECD-B08E-0201F95AA7CB` (boot headless with `xcrun simctl boot` if needed, leave it booted, never erase/shut down).

## Review Focus

1. **Status bar override left behind** — when the mirror closes (or VS Code quits) with the clean status bar on, the simulator keeps showing 9:41. Expected: the override is cleared when the mirror closes. Test in Task 3.
2. **Screenshot while the simulator is busy/locked** — `simctl io screenshot` failing must fall back to the webview frame, not lose the capture. Test in Task 1.
3. **Dropping an unsupported file** (e.g. `.zip`, `.txt`) — a clear "Reflect can't add <name> to the simulator" message, nothing else happens. Test in Task 4.
4. **Dropping many files at once** — each handled in order, one summary notification. Test in Task 4.
5. **Frame for an unknown model** (iPad, a future iPhone) — falls back to the generic rounded frame instead of a wrong cutout. Test in Task 2.

---

### Task 1: Full-resolution screenshots on iOS

**Files:** modify `src/platform/types.ts`, `src/scrcpy/MirrorSession.ts`, `src/ios/HelperMirrorSession.ts`, `src/mirror/MirrorController.ts`; tests alongside (`test/scrcpy/MirrorSession.test.ts`, `test/ios/HelperMirrorSession.test.ts`, `test/mirror/MirrorController.test.ts`, `test/fakes/FakeMirrorSession.ts`).

**Interfaces:**
- `IMirrorSession.captureScreenshot(): Promise<Uint8Array | undefined>` — PNG bytes at native resolution, or `undefined` when the session cannot (Android scrcpy returns `undefined`).
- iOS: `xcrun simctl io <udid> screenshot --type=png -` via `ISimctl` returning bytes. `ISimctl.run` returns a string today, so add `ISimctl.runBinary(args): Promise<Uint8Array>` to `SimctlRunner` (same `execFile`, `encoding: 'buffer'`, 15 s timeout).
- `MirrorController.takeScreenshot()` asks the session first; on `undefined` or a rejected promise it falls back to today's webview snapshot (Review Focus 2).

- [ ] Write failing tests: iOS session returns the PNG from `runBinary(['io', udid, 'screenshot', '--type=png', '-'])`; Android session returns `undefined`; controller saves the session PNG when present, falls back to the webview frame when it is `undefined` or throws (logs once).
- [ ] Run the focused tests — FAIL.
- [ ] Implement.
- [ ] `npm run typecheck && npm run coverage && npm run build` — green. Live: run a throwaway script calling `SimctlRunner.runBinary` for the screenshot and check the PNG is 1179×2556 (`sips -g pixelWidth -g pixelHeight`).
- [ ] Commit `feat(ios): full-resolution screenshots from simctl`.

### Task 2: Device frame per model

**Files:** create `src/ios/deviceFrames.ts`; modify `src/platform/types.ts` (capabilities), `src/platform/android/AndroidPlatform.ts`, `src/ios/IosPlatform.ts`, `src/shared/protocol.ts`, `src/mirror/MirrorController.ts`, `src/webview/ViewOptions.ts`, `src/webview/main.ts`, `src/webview/styles.css`; tests alongside.

**Interfaces:**
- `export interface DeviceFrame { readonly screenCornerRadius: number; readonly bezel: number; readonly chin: number }` in `src/shared/protocol.ts`, values as a fraction of the screen width (so they scale with the panel).
- `IPlatform.frame(device: Device): DeviceFrame` — Android returns today's generic look `{ screenCornerRadius: 0.075, bezel: 0.027, chin: 0 }` (28px/10px on a ~375px-wide screen; keep Android pixels identical by computing them back in CSS); iOS uses `frameForModel(name)` from `deviceFrames.ts`:
  - Face ID iPhones with rounded displays (iPhone X … 17, Pro/Plus/Max/mini/Air): `screenCornerRadius` from Apple's display corner radii in points ÷ screen width in points (e.g. iPhone 15: 55 / 393 ≈ 0.14), `bezel: 0.04`, `chin: 0`.
  - Home-button iPhones (SE 2nd/3rd gen, 8): `screenCornerRadius: 0`, `bezel: 0.06`, `chin: 0.3` (space for the home button below the screen).
  - Anything else (iPad, unknown names): the Android generic frame (Review Focus 5).
  Match by name with a small table of regex → frame; no network, no images.
- Host→webview message `{ type: 'device-frame'; frame: DeviceFrame }` posted by `MirrorController` on `ready` (next to `capabilities`). `ViewOptions` applies it as CSS custom properties (`--reflect-frame-radius`, `--reflect-frame-bezel-width`, `--reflect-frame-chin`) computed from the canvas width; `styles.css` uses them in `.stage--framed .screen`; the home button is a CSS circle drawn in the chin when `chin > 0`.

- [ ] Write failing tests: `frameForModel('iPhone 15')`, `('iPhone SE (3rd generation)')`, `('iPad Pro 13-inch (M4)')`, `('iPhone 99')` → expected frames; Android/iOS platforms return frames; controller posts `device-frame` on ready; `ViewOptions` sets the three custom properties from a frame and a canvas width.
- [ ] Run — FAIL. Implement. `npm run typecheck && npm run coverage && npm run build` — green.
- [ ] Manual check for the owner (F5): with the frame toggle on, the iPhone 15 mirror shows rounded corners matching the screen; an iPhone SE shows a chin with a home button.
- [ ] Commit `feat(ios): device frame per iPhone model`.

### Task 3: Clean status bar toggle

**Files:** modify `src/shared/actions.ts` (new `ActionId` `cleanStatusBar`, icon `clock`, title "Clean Status Bar for Screenshots (9:41)"), `src/platform/types.ts` (`IMirrorSession.setCleanStatusBar?` — see below), `src/ios/HelperMirrorSession.ts`, `src/ios/IosPlatform.ts` (capability), `src/actions/deviceActions.ts`, `src/actions/types.ts`, `src/mirror/MirrorController.ts` (toolbar state), `src/shared/protocol.ts` (`ToolbarState.cleanStatusBar: boolean`), `src/webview/Toolbar.ts`; tests alongside.

**Interfaces:**
- `IMirrorSession.setCleanStatusBar(on: boolean): Promise<void>` — iOS: on → `simctl status_bar <udid> override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --operatorName "" --batteryState charged --batteryLevel 100`; off → `simctl status_bar <udid> clear`. Android scrcpy session: resolves without doing anything (the action is not in Android's capabilities).
- `MirrorCapabilities.toggleCleanStatusBar(): Promise<void>` on `MirrorController`, mirroring `toggleScreenPower` (state flag, `postToolbarState`, button highlighted while on).
- `DEVICE_ACTIONS.cleanStatusBar = ({ mirror }) => mirror.toggleCleanStatusBar()`.
- iOS capabilities add `'cleanStatusBar'`; Android unchanged.
- On mirror close with the flag on, the controller calls `setCleanStatusBar(false)` before disposing the session (Review Focus 1).

- [ ] Write failing tests: iOS session runs the exact override/clear args; controller toggles state + toolbar highlight; close clears the override when it was on and does nothing when off; Android capabilities do not include `cleanStatusBar`; toolbar shows the new button only when listed.
- [ ] Run — FAIL. Implement. Suite + build green.
- [ ] Live: throwaway script runs the override then `xcrun simctl io <udid> screenshot` → status bar shows 9:41 and full battery; then clear.
- [ ] Commit `feat(ios): clean status bar toggle for App Store screenshots`.

### Task 4: Drag and drop onto the iOS mirror

**Files:** create `src/ios/SimulatorDropHandler.ts`, `src/webview/DropTarget.ts`; modify `src/shared/protocol.ts`, `src/platform/types.ts`, `src/ios/IosPlatform.ts`, `src/mirror/MirrorController.ts`, `src/webview/main.ts`, `src/webview/styles.css`; tests alongside.

**Step 0 (spike, throwaway):** confirm how VS Code delivers drops to a webview view in this version: build a 20-line test webview in the Extension Development Host (or read VS Code's webview drop docs via context7) and record whether drops from Finder and from the VS Code Explorer reach `drop` events, which `dataTransfer` types arrive (`Files`, `text/uri-list`, `application/vnd.code.uri-list`) and whether Shift is required. Write the findings into the task report; the design below assumes `text/uri-list` (or VS Code's uri list) plus `Files` with content.

**Interfaces:**
- Webview `DropTarget` on `.stage`: highlights on dragover (`stage--drop`), on drop posts `{ type: 'drop-files'; uris: readonly string[]; files: readonly { name: string; data: Uint8Array }[] }`. Only active when the host listed `dropFiles` in capabilities (`PlatformCapabilities.acceptsDrops: boolean`; iOS true, Android false).
- Host: `MirrorController` forwards to `IMirrorSession.addFiles(files: readonly DroppedFile[]): Promise<AddFilesResult>` where `DroppedFile = { name: string; path: string }` (file contents written by the controller to a temp dir under `os.tmpdir()/reflect-drops/<uuid>/<name>` via an injected writer; URIs converted with `vscode.Uri.parse(u).fsPath` in the extension wiring).
- iOS `SimulatorDropHandler.add(udid, files)`: route by extension — `.app` (directory) / `.ipa` → `simctl install <udid> <path>`; `.png .jpg .jpeg .heic .gif .mov .mp4 .m4v` → `simctl addmedia <udid> <paths…>` (batched); `.pem .cer .crt .der` → `simctl keychain <udid> add-root-cert <path>`; anything else → reported as unsupported (Review Focus 3). Files run in drop order; one notification summarises ("Installed 1 app, added 3 photos/videos" / "Reflect can't add notes.txt to the simulator") (Review Focus 4).
- Android session `addFiles` resolves `{ added: [], unsupported: all }` but is never called (no capability).

- [ ] Spike (Step 0) and record findings.
- [ ] Write failing tests: routing table per extension; batching of media; order preserved; summary text; unsupported message; webview posts files/uris on drop and only when enabled; controller writes dropped contents to temp files and cleans them after the session call.
- [ ] Run — FAIL. Implement. Suite + build green.
- [ ] Live: throwaway script calls `SimulatorDropHandler` with a PNG and a JPG → `xcrun simctl io` screenshot of the Photos app shows them, or `simctl` exit 0; `.app` install with any simulator build available — skip if none, note it.
- [ ] Commit `feat(ios): drag and drop apps, photos and certificates onto the simulator`.
