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

### Video

- H.264 Baseline, real time, no B-frames, a keyframe at least every `fps * 2` frames and every
  2 seconds. A `keyframe` request stays pending until a keyframe is actually emitted.
- Output size: the framebuffer scaled so its longest side is at most `--max-size` (no
  upscaling; `<= 0` means no limit), both sides rounded down to even
  (iPhone 15: 1179×2556 → 884×1920 at 1920).
- A `video-config` comes before the first `video-frame`, before every keyframe (so a decoder
  can join late) and whenever SPS/PPS or the size change. Its payload is the output size plus
  the SPS and PPS, each prefixed by `00 00 00 01`. `video-frame` payloads are Annex-B and do not
  repeat SPS/PPS.
- `pts` is microseconds since capture started (monotonic, strictly increasing).
- Frames are encoded when the simulator composites a new one, at most `fps` per second. When
  nothing changed for one second, the last frame is encoded again, so `keyframe` is answered on
  a static screen.
- `keyframe` forces the next frame to be a keyframe; `quality` recreates the encoder with the
  new settings (the next frame is a keyframe).

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
| `simulatorApp` | `action` (`hide`\|`show`\|`quit`) |
| `stop` | - (helper exits 0; EOF also exits 0) |

An unknown `type` produces an `event` frame `{"type":"warning","message":"unknown command <type>"}`;
malformed lines produce a `warning` event. The helper never crashes on bad input.

### Input

- Points outside the screen are clamped to `[0, pointWidth] × [0, pointHeight]`.
- `touch`: one finger per `id`; send `down`, any number of `move`, then `up` with the same `id`.
  `id` is an unsigned 32-bit integer. Use ids in `0..0xFFFF` (65535): the helper reserves
  `0x10000` and above (counting up from `0x10000`) for the touches it generates for `scroll`,
  so a client id in that range could collide with a scroll in flight.
  Multi-touch is not supported yet: the simulator receives a single finger, so keep one
  touch down at a time (Reflect drops the second, virtual pinch finger before it reaches
  the helper).
- `scroll`: a drag by (`dx`, `dy`) points starting at (`x`, `y`): `down`, 6 moves 16 ms apart,
  `up`, with a touch id of its own. A negative `dy` moves the finger up (the content scrolls
  down). Each `scroll` takes about 110 ms and input is handled in order, so coalesce wheel
  deltas before sending. iOS applies its own momentum after the lift.
- `key`: USB HID keyboard usage (page 0x07), sent to the simulator's hardware keyboard.
- `button` names: `home`, `lock`, `volumeUp`, `volumeDown`, `siri`, `shake`, `appSwitcher`.
  `down: true`/`false` press and release the first five; `appSwitcher` (two Home presses) and
  `shake` act on `down: true` only. Another name produces a warning
  `{"type":"warning","message":"unknown button <name>"}`.
- `rotate` cycles portrait → landscapeLeft → portraitUpsideDown → landscapeRight and emits
  `{"type":"orientation-changed","orientation":"landscapeLeft"}` (`portrait`, `landscapeLeft`,
  `portraitUpsideDown`, `landscapeRight`). The helper assumes portrait at start. Apps choose
  which orientations they follow (iPhones with Face ID ignore `portraitUpsideDown`).
- `simulatorApp` hides or shows Simulator.app's windows, or quits it. `quit` first sets Simulator's `DetachOnAppQuit` preference so booted devices keep running. Nothing happens when Simulator.app is not running.
- If input cannot reach the simulator (a missing private API, a SimulatorKit exception), the
  helper reports one `{"type":"error","code":"framework-unavailable",…}` event and keeps
  streaming video; later input failures are only logged on stderr.

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
