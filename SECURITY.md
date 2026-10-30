# Security Policy

## Supported versions

Only the latest released version of Reflect receives security fixes.

## Reporting a vulnerability

**Please do not open public issues for security problems.**

Report vulnerabilities privately through GitHub Security Advisories:

1. Go to the [Security tab](https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/security) of the repository.
2. Click **Report a vulnerability** ([direct link](https://github.com/GabrielCordeiroBarrosoTeles/reflect-android/security/advisories/new)).
3. Describe the issue, the impact and the steps to reproduce it.

You can expect an acknowledgement within 7 days. Once the issue is confirmed, a fix will be prepared privately and released as soon as possible, and you will be credited in the advisory unless you prefer to stay anonymous.

## Scope

Reflect talks to the local adb server and runs the scrcpy server on a device you explicitly selected. Reports about the extension host, the webview (for example, content security policy bypasses), the bundled scrcpy-server integration and the release pipeline are all in scope. Issues in scrcpy or adb themselves should be reported upstream.
