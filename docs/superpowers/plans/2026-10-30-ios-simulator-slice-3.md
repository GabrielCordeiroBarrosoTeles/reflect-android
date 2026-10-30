# iOS Simulator — Slice 3 (React Native tools through Metro) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Component inspector, Network and AsyncStorage tabs, Reload and Dev Menu work against a React Native app running on a mirrored iOS Simulator, with Reverse Metro hidden on iOS and Android unchanged (issue #36).

**Architecture:** The Metro tools are already platform-neutral: they talk to the app through Metro's `/json/list` and the Chrome DevTools Protocol, and the inspector works in normalized screen coordinates (0..1) that the app scales by its root view size in points. The only platform-sensitive piece is `selectTarget`, which picks the Metro target for the mirrored device. Toolbar actions are gated by `PlatformCapabilities`, so Reverse Metro is hidden on iOS by not listing it.

**Tech Stack:** TypeScript / VS Code API / Vitest (100% coverage) / esbuild; Metro inspector proxy; Expo demo app (`examples/demo-app`).

**Spec:** `docs/superpowers/specs/2026-10-29-ios-simulator-design.md` (§5.2 "Metro-based tabs stay shared; only `selectTarget` must match by the simulator's name as well as the Android model"; §7 rows "Reload / Dev Menu", "Reverse Metro", "Component inspector, Network, AsyncStorage"; §9 slice 3). Runs on `feat/ios-simulator-slice-2` (slices 1, 2 and 7).

## Global Constraints

- 100% line/branch/function/statement coverage on `src/**/*.ts`; every task ends with `npm run typecheck && npm run coverage` green and `npm run build` OK.
- `src/extension.ts` is the only composition root. No platform `if`s in the core.
- Android behaviour must not change: a single Android target that does not match the model is still picked; model matching ignoring case and punctuation still works.
- Public files in English; no TS code comments; conventional commits; NO `Co-Authored-By`; never push.
- Live checks use the iPhone 15 simulator `BDAE45E9-4A82-4ECD-B08E-0201F95AA7CB` and Metro on port 8081.

## Current state (read before changing anything)

- iOS devices come from `parseSimctlDevices` with `name` and `model` both set to the simulator name (e.g. `iPhone 15`). React Native on iOS reports `[UIDevice currentDevice].name` as Metro's `deviceName`, which on a simulator is that same name.
- `selectTarget` normalizes (`lowercase`, strip non-alphanumerics) and picks the **first** target whose `deviceName + title` *contains* the model. `iphone15` is contained in `iphone15pro` and `iphone15plus`, so with an iPhone 15 and an iPhone 15 Pro both running the app, the mirror of the iPhone 15 can attach to the Pro's app. The same bug exists on Android (`Pixel 8` vs `Pixel 8 Pro`).
- The inspector sends `point.x/y` in 0..1 of the video; `hitTestScript` multiplies by the root view's measured size (points) and returns rects divided by the same size, so pixels vs points and the 3x scale never enter the math. This needs a live check, not a change, unless the root view is offset on iOS.
- `IosPlatform` capabilities already list `component`, `network`, `storage`, `devMenu`, `reload` and omit `reverseMetro`; `MirrorManager` refuses actions a mirror does not support, so the `reflect.action.reverseMetro` command is a no-op on an iOS mirror.
- Reload: `AppReloader` sends CDP `Page.reload` to the selected target; when no target is found, `IosDeviceControl.reloadShortcut()` sends Cmd+R through HID. Dev Menu: `pressButton('menu')` maps to the helper's `shake`.

## Review Focus

1. **Two simulators with related names** (`iPhone 15` and `iPhone 15 Pro`) both connected to Metro — each mirror must attach to its own app, in either target order. Test in Task 1.
2. **Several targets for the same device** (React Native lists more than one page per app, e.g. after a reload or with Expo Go) — the selection must be one of that device's targets, never another device's. Test in Task 1.
3. **Android physical device whose Metro `deviceName` is not exactly the model** (e.g. `SM-F741B - 16 - API 36`) — still matched by containment; single non-matching target still picked. Existing tests stay green.
4. **Hit-test on iOS** — click/hover near the corners and under the status bar map to the right component; highlight rectangles line up with the video. Live check in Task 2.

---

### Task 1: `selectTarget` prefers the exact device match

**Files:** modify `src/inspector/selectTarget.ts`; test `test/inspector/selectTarget.test.ts`.

**Interface (unchanged):** `selectTarget(targets: readonly MetroTarget[], device: Device): MetroTarget | undefined`.

**Behaviour:**
- Candidate names: the device `name` and `model` (normalized, empty ones dropped).
- Rank each target: `2` when its normalized `deviceName` equals a candidate; `1` when `deviceName + title` contains a candidate; `0` otherwise.
- Return the first target with the highest rank `> 0`; otherwise the only target when there is exactly one; otherwise `undefined`.

- [ ] Write failing tests: `iPhone 15` picks the `iPhone 15` target when `iPhone 15 Pro` is listed first; `iPhone 15 Pro` picks its own; matching by `name` when `model` is undefined; with two targets of the same device the first of them is returned; existing Android cases kept.
- [ ] Run the focused tests — FAIL.
- [ ] Implement.
- [ ] `npm run typecheck && npm run coverage && npm run build` — green.
- [ ] Commit `fix(inspector): prefer the exact device name when picking the Metro target`.

### Task 2: Live verification against the demo app on the iPhone 15

**Files:** none in the repo (throwaway scripts in the session scratchpad; the demo app gets a temporary AsyncStorage import that is reverted).

- [ ] Build and run `examples/demo-app` on the iPhone 15 with `npx expo run:ios --device <udid>` (Metro on 8081).
- [ ] Record `/json/list`; check `selectTarget` with the real `Device` from `parseSimctlDevices` picks the iPhone 15 target.
- [ ] Component inspector: through `MetroConnection` + `ComponentInspector`, `inspectAt` and `highlightAt` at points on known components (title text, a task row, a corner); compare the returned rect × the simulator's point size with the component's real frame from a screenshot.
- [ ] Network: install the network script, run a `fetch` in the app through CDP, read the captured entry through `NetworkReader`.
- [ ] AsyncStorage: read, set and remove a key through `AsyncStorageReader`.
- [ ] Reload: `AppReloader.reload(device)` returns `true` and the app reloads. Dev Menu: helper `shake` opens the React Native dev menu (screenshot).
- [ ] Reverse Metro: confirm `IosPlatform.capabilities().actions` does not include `reverseMetro` (covered by the existing test).
- [ ] Any defect found becomes its own TDD task appended below.

### Task 3: Report

- [ ] Write `.superpowers/sdd/2026-10-30-ios-simulator-slice-2/slice-3-report.md` with commits, tests, live evidence and open issues.
