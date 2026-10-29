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

`hello` JSON (always the first frame):

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
