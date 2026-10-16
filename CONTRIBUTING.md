# Contributing to Reflect for Android

Thanks for your interest in improving Reflect! This guide explains how to set up the project, the rules every change must follow, and how pull requests are reviewed.

## Table of contents

- [Local setup](#local-setup)
- [Project structure](#project-structure)
- [Running the tests](#running-the-tests)
- [The 100% coverage rule](#the-100-coverage-rule)
- [Writing tests](#writing-tests)
- [Testing with a real device](#testing-with-a-real-device)
- [Commit convention](#commit-convention)
- [Pull request flow](#pull-request-flow)
- [Pull request checklist](#pull-request-checklist)
- [For maintainers](#for-maintainers)

## Local setup

Requirements: **Node.js 20+**, **npm**, **VS Code 1.106+** and Android platform-tools (`adb`).

```bash
git clone https://github.com/<your-user>/reflect-android.git
cd reflect-android
npm install
npm run fetch-server   # downloads scrcpy-server 3.3.3 into assets/ and verifies its SHA-256
npm run watch          # rebuilds dist/ on every change
```

Then open the folder in VS Code and press **F5**. A new window titled **[Extension Development Host]** opens with the extension loaded. Run **Reflect: Open Device** from the Command Palette there.

Useful scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Type-checks and bundles the extension and the webview. |
| `npm run watch` | Rebuilds on change. |
| `npm run typecheck` | Runs `tsc --noEmit` over `src/` and `test/`. |
| `npm test` | Runs the unit tests once. |
| `npm run test:watch` | Runs the unit tests in watch mode. |
| `npm run coverage` | Runs the tests with coverage and fails below 100%. |
| `npm run package` | Builds a `.vsix` with `vsce`. |

## Project structure

```
src/
  extension.ts   Composition root: the only place that wires concrete classes together.
  core/          Disposable, Emitter, domain errors. No VS Code dependency.
  adb/           adb discovery (Chain of Responsibility), adb server gateway, device tracking and selection.
  scrcpy/        Mirror session (Facade), state machine, control channel, scrcpy launcher.
  mirror/        Webview panel, typed bridge (Mediator), controller and manager.
  ui/            VS Code presenters: status bar, errors, device picker.
  commands/      VS Code commands.
  shared/        Message protocol shared by the extension host and the webview.
  webview/       Code that runs inside the webview: WebCodecs decoding and input capture.
test/            Mirrors src/ one-to-one, plus mocks/ and fakes/.
```

Design rules used across the codebase:

- Depend on interfaces declared in each module's `types.ts`, and receive dependencies through constructors.
- Only `extension.ts` instantiates concrete classes.
- Everything that holds a resource implements `IDisposable` and is released when its owner is disposed.
- No comments in the code: prefer clear names and small functions. Explain decisions in the pull request.
- Use the VS Code theme tokens (`--vscode-*`) in the webview CSS.

## Running the tests

```bash
npm test            # run once
npm run test:watch  # watch mode
npm run coverage    # with coverage report (text, HTML in coverage/, lcov)
```

Tests run with [Vitest](https://vitest.dev). They never need a device, `adb`, the network or the scrcpy-server binary.

## The 100% coverage rule

**Every pull request must keep line, branch, function and statement coverage at 100%.** The thresholds are enforced in `vitest.config.mts` and CI fails if coverage drops.

- Only files that contain types exclusively (`**/types.ts` and `src/shared/protocol.ts`) are excluded. Any new exclusion needs a written justification in the config and maintainer approval.
- `/* v8 ignore */` and `/* istanbul ignore */` are not allowed without prior discussion in the pull request.
- If a branch cannot be reached, it is dead code: **remove it** instead of writing an artificial test.
- Test behavior, not implementation. A test that only exists to turn a line green will be rejected in review.

## Writing tests

- Place the test next to its mirror path: `src/adb/DeviceTracker.ts` → `test/adb/DeviceTracker.test.ts`.
- Use the reusable fakes in `test/fakes/` (`FakeAdbServerGateway`, `FakeDeviceTracker`, `FakeMirrorSession`, `FakeScrcpyLauncher`, `FakeLogger`, `FakeClipboard`, …). They implement the project's own interfaces, so prefer them over global mocks.
- `vscode` is aliased to the manual mock in `test/mocks/vscode.ts`. Extend it only with what the production code actually uses. It is reset before every test.
- Tests for `src/webview/**` start with `// @vitest-environment happy-dom`.
- Use `vi.useFakeTimers()` for time-based logic (`RetryBackoff`, `KeyframeThrottle`, frame reports).
- Mock third-party modules (`vi.mock`) only at I/O boundaries, such as the adb TCP client or the scrcpy launcher.
- If production code is hard to test, inject the dependency through the constructor with the smallest change possible and mention it in the pull request.

## Testing with a real device

Automated tests do not replace a quick manual check. A small Expo app lives in `examples/demo-app` with a text field, a clipboard button, a pinch-to-zoom image and a long list — everything you need to exercise the extension:

```bash
cd examples/demo-app
npm install
npx expo start   # scan the QR code with the Expo Go app on your phone
```

1. Enable **Developer options** and **USB debugging** on the phone, connect it and accept the prompt.
2. Press **F5** and run **Reflect: Open Device**.
3. Check mirroring, touch, scroll, keyboard and clipboard, and anything your change touches.
4. Close the tab and make sure nothing keeps running: `adb shell ps -A | grep scrcpy` must print nothing.
5. Logs are in **View → Output → Reflect for Android**.

Mention in the pull request which device and Android version you used.

## Commit convention

Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat(mirror): add screenshot action
fix(webview): recover the decoder after a resize
test(adb): cover tracker failures
docs: explain the coverage rule
chore(deps): bump vitest
```

Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Use `!` or a `BREAKING CHANGE:` footer for breaking changes.

## Pull request flow

1. **Fork** the repository and create a branch from `main`: `git checkout -b feat/short-description`.
2. Make focused changes with tests.
3. Run `npm run typecheck`, `npm run coverage` and `npm run build` locally.
4. Add an entry to `CHANGELOG.md` under **Unreleased**.
5. Open a pull request against `main` and fill in the template.
6. A maintainer reviews it. CI must be green and at least one approval is required before merging.

For larger features, open an issue or a discussion first so we can agree on the approach.

## Pull request checklist

- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes.
- [ ] `npm run coverage` stays at 100%.
- [ ] New or changed code is covered by meaningful tests.
- [ ] Tested on a real device (model and Android version listed in the PR).
- [ ] `CHANGELOG.md` updated.
- [ ] Commits follow Conventional Commits.

## For maintainers

### Releasing

1. Update `version` in `package.json` and move the **Unreleased** entries in `CHANGELOG.md` to the new version.
2. Merge to `main`, then tag: `git tag v0.1.0 && git push origin v0.1.0`.
3. The `release.yml` workflow runs the tests, packages the `.vsix`, attaches it to a GitHub Release and publishes to the VS Code Marketplace and Open VSX.

### Repository secrets

| Secret | Used by | How to get it |
| --- | --- | --- |
| `VSCE_PAT` | `release.yml` | Azure DevOps personal access token with the **Marketplace → Manage** scope for the `gabrielcordeiro` publisher. |
| `OVSX_PAT` | `release.yml` | Access token from your [open-vsx.org](https://open-vsx.org/user-settings/tokens) account (the namespace must exist: `npx ovsx create-namespace gabrielcordeiro`). |
| `CODECOV_TOKEN` | `ci.yml` | Repository upload token from [codecov.io](https://codecov.io) after installing the Codecov GitHub App. |
