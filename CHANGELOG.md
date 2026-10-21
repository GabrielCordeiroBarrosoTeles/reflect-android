# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-21

### Changed

- **Component**, **Device Info** and the new tools now live in one **Tools** panel with tabs (Component, Network, Logs, Storage, Device, Performance, Actions; the active tab shows its name, the others their icon) instead of stacked views. The panel remembers the last tab, opens on Component after an inspection, and only polls device info while the Device tab is visible.

### Added

- **Performance** tab: CPU, memory, frames per second and janky frames of the foreground app with sparklines of the last two minutes and frame-time percentiles, from `top`, `dumpsys meminfo` and `dumpsys gfxinfo`. Pause and reset frame stats. It samples every 2 seconds only while the tab is open and starts over when the app changes or restarts.
- **Actions** tab: open deep links (recent links remembered); restart the foreground app, clear its data with confirmation, open its settings and set its language; runtime permissions grouped by kind with their status and a switch per group or permission; and tiles for dark mode, animations, show touches, layout bounds, Wi-Fi, mobile data, airplane mode, font size and a simulated battery level. Wi-Fi and airplane mode stay locked while Reflect is connected over Wi-Fi, and inputs are validated before any shell command runs.
- **Logs** tab: JavaScript and native logs of the app in the foreground (logcat filtered by its process), with text and level filters, a JavaScript-only toggle, pause, copy and clear. Multi-line entries such as stack traces are grouped, errors are highlighted, and the view follows new lines only while scrolled to the bottom. It reads only new lines once a second while the tab is open and starts over when the app restarts.
- **Network** tab: captures the app's HTTP requests (fetch and XMLHttpRequest) through Metro, without installing anything in the app. Filter by URL and status, inspect headers, request and response bodies (JSON formatted, image responses previewed, bodies over 256 KB truncated), copy as cURL, copy the response, pause and clear. It only polls while the tab is open and survives app reloads.
- **Storage** panel for the AsyncStorage of the React Native app in development mode: filter keys, see each value's type and size, edit values with JSON formatting and validation (<kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>S</kbd> to save), create keys, delete one or all keys with confirmation, preview values that are image links or `data:image` strings, and copy a value or everything as JSON. The panel only appears while an app on the mirrored device is connected to Metro, and Reflect only checks Metro while a device is mirrored.

### Fixed

- The component inspector and other tools now share a single debugger connection to the app, so two features asking at the same time no longer open a second connection that drops the first.

## [0.1.1] - 2026-10-19

### Fixed

- Removed the broken Marketplace, Open VSX and Codecov badges from the README and added working release and stars badges.
- The README no longer links to Open VSX before the extension is published there.

## [0.1.0] - 2026-10-16

### Added

- Toolbar above the mirrored screen with Back, Home, Recent Apps, Rotate, physical screen on/off, screenshot, recording, Dev Menu, Reload and Reverse Metro Port.
- Screenshots (PNG) and MP4 recordings without re-encoding, saved to `reflect.capturesDirectory` and copied to the clipboard (`reflect.copyCapturesToClipboard`), with Open and Reveal actions.
- React Native shortcuts: Reload through Metro (falls back to pressing R twice), Dev Menu and `adb reverse` for the Metro port.
- Keyboard shortcuts for Back, Home, Reload, Dev Menu, Screenshot and Rotate while the mirror has focus, and a `Reflect: …` command for every toolbar action.
- Automatic reconnection when the device is unplugged and plugged back in, with a **Reconnect** button after two minutes without the device. Recordings in progress are saved before reconnecting.
- Hover highlight while inspecting: the component under the cursor is outlined with its content, padding and margin, and labelled with the component from your code and its source line.
- Device frame and 1:1 zoom toggles, remembered between sessions.
- **Move to Editor Tab** and **Move to Side Bar** to switch where the mirror lives without restarting it.

### Changed

- The view title button now moves the open mirror to an editor tab instead of opening a second one.
- The donation section shows a PIX QR code card.
- More Marketplace keywords.

## [0.0.2] - 2026-10-16

### Changed

- Updated the Marketplace page: demo GIF, PIX donation key, links to the published extension and contact information.

## [0.0.1] - 2026-10-16

### Added

- Device view in the Secondary Side Bar, with an idle screen and an **Open Device** button.
- `Reflect: Open Device` command with a device picker when several devices are connected, and `Reflect: Open Device in Editor Tab`.
- `reflect.location` setting to choose between the Secondary Side Bar and an editor tab.
- Hidden mirrors pause after 30 seconds and resume when the side bar is shown again.
- Component inspector for React Native 0.76+ (including Expo): click a component on the mirrored screen to see its name, props and owners, and open its source line.
- Device Info view with device, battery, memory, storage, network and foreground app details.
- `reflect.metroPort`, `reflect.inspector.openSourceOnSelect` and `reflect.privacy.maskIpAddress` settings.
- Live mirroring of a USB-connected Android device using scrcpy-server 3.3.3 and hardware-accelerated WebCodecs decoding.
- Touch, drag, scroll and keyboard input.
- Pinch to zoom with a trackpad pinch, Option/Alt + scroll or Option/Alt + drag, centered on the cursor.
- Clipboard sync between the computer and the device.
- Right click for Back and middle click for Home.
- Status bar item showing the connected device.
- Automatic `adb` discovery with the `reflect.adbPath` setting.
- Clear errors for missing `adb`, unauthorized or offline devices and mirroring failures.

[Unreleased]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/releases/tag/v0.0.1
