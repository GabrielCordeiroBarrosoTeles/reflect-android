# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.0.2...HEAD
[0.0.2]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/releases/tag/v0.0.1
