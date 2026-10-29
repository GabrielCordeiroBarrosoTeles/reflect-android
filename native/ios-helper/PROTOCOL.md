# reflect-sim-helper wire protocol (version 1)

CLI: `reflect-sim-helper --udid <UDID> [--fps 60] [--bitrate 8000000] [--max-size 1920]`
(`--udid` is required; missing -> message on stderr, exit 64).

## stdout: frames

```
[u8 type][u32 length BE][payload]
```

All integers are big-endian. `length` is the payload size in bytes.

| type | name | payload |
|------|------|---------|
| `0x01` | hello | JSON |
| `0x02` | video-config | `[u16 width BE][u16 height BE][Annex-B SPS+PPS]` |
| `0x03` | video-frame | `[u8 flags][u64 pts µs BE][Annex-B]`, flags bit0 = keyframe |
| `0x04` | event | JSON, e.g. `{"type":"warning","message":"unknown command x"}` |

`hello` JSON (the first frame on a successful start; `device` sizes are points, from the
simulator's device type: pixel size / scale):

```json
{ "protocol": 1, "xcodeVersion": "26.6",
  "device": { "name": "iPhone 17", "pointWidth": 393, "pointHeight": 852, "scale": 3 },
  "capabilities": ["touch"] }
```

## stdin: commands

One JSON object per line. Coordinates are device points.

| type | fields |
|------|--------|
| `touch` | `phase` (`down`\|`move`\|`up`), `x`, `y`, `id` |
| `scroll` | `x`, `y`, `dx`, `dy` |
| `key` | `usage` (HID usage, u32), `down` |
| `button` | `name`, `down` |
| `rotate` | - |
| `keyframe` | - |
| `quality` | `bitrate`, `fps`, `maxSize` (integers) |
| `simulatorApp` | `action` (`hide`\|`show`) |
| `stop` | - (helper exits 0; EOF also exits 0) |

An unknown `type` produces an `event` frame `{"type":"warning","message":"unknown command <type>"}`;
malformed lines produce a `warning` event. The helper never crashes on bad input.

## Start-up errors

Before `hello` the helper checks the Xcode version (26 or newer), loads CoreSimulator and
SimulatorKit, probes every private class and symbol it needs and finds the simulator.
A failure is reported as one `event` frame, then the helper exits with code **2**:

```json
{ "type": "error", "code": "device-not-booted", "message": "simulator is not booted (state: Shutdown)" }
```

| code | meaning |
|------|---------|
| `xcode-unsupported` | no Xcode, Xcode older than 26, or a required private API is missing |
| `framework-unavailable` | CoreSimulator / SimulatorKit / IOKit could not be loaded or answered unexpectedly |
| `device-not-found` | no simulator with that UDID |
| `device-not-booted` | the simulator exists but is not booted |

## Exit codes

| code | when |
|------|------|
| 0 | `stop`, EOF on stdin, or stdout closed (the parent went away; SIGPIPE is ignored) |
| 2 | start-up error (see above) |
| 64 | missing `--udid` |
