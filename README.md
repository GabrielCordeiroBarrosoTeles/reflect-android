<p align="center">
  <img src="assets/icon.png" width="96" alt="Reflect for Android logo">
</p>

<h1 align="center">Reflect for Android</h1>

<p align="center">
  Mirror and control a physical Android device inside a VS Code tab — no emulator, no external window.
</p>

<p align="center">
  <a href="https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/actions/workflows/ci.yml"><img src="https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://codecov.io/gh/GabrielCordeiroBarrosoTeles/reflect-android"><img src="https://codecov.io/gh/GabrielCordeiroBarrosoTeles/reflect-android/branch/main/graph/badge.svg" alt="Coverage"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=gabrielcordeiro.reflect-android"><img src="https://img.shields.io/visual-studio-marketplace/v/gabrielcordeiro.reflect-android?label=Marketplace" alt="Marketplace version"></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=gabrielcordeiro.reflect-android"><img src="https://img.shields.io/visual-studio-marketplace/i/gabrielcordeiro.reflect-android" alt="Installs"></a>
  <a href="https://open-vsx.org/extension/gabrielcordeiro/reflect-android"><img src="https://img.shields.io/open-vsx/v/gabrielcordeiro/reflect-android?label=Open%20VSX" alt="Open VSX version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GabrielCordeiroBarrosoTeles/reflect-android" alt="License"></a>
</p>

<p align="center">
  <img src="assets/demo.gif" width="900" alt="Reflect mirroring an Android phone in the VS Code side bar, typing from the computer keyboard and inspecting a React Native component that opens its source line">
</p>

## Why

Emulators are heavy, and mirroring a real phone usually means juggling an extra window. Reflect streams your phone's screen into an editor tab and lets you drive it with your mouse and keyboard, right next to your code. It is built for React Native developers, but works for any Android app.

Under the hood Reflect uses the [scrcpy](https://github.com/Genymobile/scrcpy) protocol through the [Tango](https://github.com/yume-chan/ya-webadb) libraries. Video is H.264 decoded with WebCodecs (hardware-accelerated where available), so it stays light on your machine.

## Features

- **Lives in the Secondary Side Bar**, right next to your code (or in an editor tab, if you prefer).
- **Live mirroring** of a USB-connected device with correct aspect ratio and low latency.
- **Touch and drag** with the mouse and **scroll** with the wheel or trackpad.
- **Pinch to zoom** with a two-finger trackpad pinch, <kbd>Option</kbd>/<kbd>Alt</kbd> + scroll, or <kbd>Option</kbd>/<kbd>Alt</kbd> + drag.
- **Keyboard input**, including special keys and editing shortcuts.
- **Clipboard sync**: <kbd>Cmd</kbd>/<kbd>Ctrl</kbd>+<kbd>V</kbd> pastes your computer's clipboard on the device; text copied on the device lands on your computer.
- **Mouse shortcuts**: right click = Back, middle click = Home.
- **Component inspector** for React Native: click **Inspect**, then any element on the mirrored screen to see the component, its props and who rendered it — and jump straight to the line in your code. Works with React Native 0.76+ (including Expo) in development mode, with Metro running.
- **Device Info** panel: model, Android version, display, battery level/temperature, memory, storage, Wi-Fi IP and the foreground app, refreshed every 5 seconds while visible.
- **Status bar item** showing the connected device — click it to open the mirror.
- **Clear errors** when `adb` is missing, the device is unauthorized or USB debugging is off.
- **Nothing left running**: closing the mirror stops the scrcpy server, closes the sockets and releases the decoder. If the side bar stays hidden for 30 seconds the session is paused, and it resumes when you show it again.
- **No telemetry.**

### Roadmap

Toolbar (Back/Home/Recents/Rotate), hover highlight while inspecting, screenshots, MP4 recording, React Native shortcuts (Dev Menu, Reload, `adb reverse` for Metro), automatic reconnection, dev tools (deep links, app actions, APK install, dark mode/font scale/locale, show touches, layout bounds, network toggles), a filtered logcat panel, device frame and 1:1 zoom, and Wi-Fi connections.

## Requirements

- **VS Code 1.106** or newer (also Cursor, Windsurf and VSCodium builds based on 1.106+, through Open VSX).
- **Android platform-tools** (`adb`). Install them with Android Studio or download them from [developer.android.com](https://developer.android.com/tools/releases/platform-tools).
- An Android device with **USB debugging enabled** ([how to enable](https://developer.android.com/studio/debug/dev-options#enable)) and Android 5.0 or newer.

## Installation

- **VS Code Marketplace**: search for "Reflect for Android" in the Extensions view, or run `code --install-extension gabrielcordeiro.reflect-android`.
- **Open VSX** (Cursor, Windsurf, VSCodium): install from [open-vsx.org](https://open-vsx.org/extension/gabrielcordeiro/reflect-android).

## Usage

1. Connect your phone via USB and accept the "Allow USB debugging" prompt.
2. Click the **Reflect** icon in the Secondary Side Bar (<kbd>Cmd</kbd>+<kbd>Option</kbd>+<kbd>B</kbd> / <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>B</kbd> shows it) and press **Open Device**, run **Reflect: Open Device** from the Command Palette, or click the device in the status bar.
3. If more than one device is connected, pick one from the list.
4. Click inside the mirrored screen to focus it, then use your mouse and keyboard.

Prefer a bigger screen? Run **Reflect: Open Device in Editor Tab**, or set `reflect.location` to `editor`.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `reflect.adbPath` | `""` | Absolute path to the `adb` executable. Leave empty to auto-detect. |
| `reflect.location` | `secondarySidebar` | Where **Reflect: Open Device** shows the device: `secondarySidebar` or `editor`. |
| `reflect.metroPort` | `8081` | Metro port used by the component inspector. |
| `reflect.inspector.openSourceOnSelect` | `true` | Open the source file of an inspected component automatically. |
| `reflect.privacy.maskIpAddress` | `false` | Hide the last part of the IP address in Device Info (handy for screenshots). |

When `reflect.adbPath` is empty, Reflect looks for `adb` in this order: `$ANDROID_HOME/platform-tools` (or `$ANDROID_SDK_ROOT`), the default SDK location for your OS, then your `PATH`.

## Troubleshooting

| Problem | What to try |
| --- | --- |
| "adb not found" | Install platform-tools or set `reflect.adbPath`. |
| "device not authorized" | Unlock the phone and accept the USB debugging prompt. If it does not appear, revoke USB debugging authorizations in Developer options and reconnect. |
| "device is offline" | Reconnect the cable, try another USB port or cable, or toggle USB debugging. |
| Black screen | Open **View → Output → Reflect for Android** and check the `[webview]` lines. Include them when you open an issue. |
| Input does nothing | Click the mirrored screen first so it receives focus. |
| "Metro is not running" when inspecting | Start your app with `npx expo start` or `npx react-native start`, or set `reflect.metroPort`. |
| "No debuggable React Native app" | Open the app in development mode. The inspector needs React Native 0.76 or newer. |

## Contributing

Contributions are very welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the local setup, the testing rules (100% coverage is required) and the pull request flow. By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

Found a security issue? Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## ☕ Support the project

Reflect is free and open source. If it saves you time, you can support its development:

- [GitHub Sponsors](https://github.com/sponsors/GabrielCordeiroBarrosoTeles)
- [Ko-fi](https://ko-fi.com/<SEU_USUARIO>)
- [Buy Me a Coffee](https://buymeacoffee.com/<SEU_USUARIO>)
- 🇧🇷 **PIX**: `<SUA_CHAVE_PIX>`

Starring the repository and sharing it with other developers helps a lot too.

## Credits and licenses

- Reflect for Android is released under the [MIT License](LICENSE).
- It bundles the **scrcpy server** by Genymobile and Romain Vimont, licensed under the [Apache License 2.0](assets/scrcpy-server.LICENSE).
- It uses the **Tango** (`@yume-chan/*`) libraries by Simon Chan, licensed under the MIT License.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the full attributions.
