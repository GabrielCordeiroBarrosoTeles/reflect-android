#!/usr/bin/env node
// Dev-only: turns captured reflect-sim-helper stdout into a raw Annex-B .h264 stream.
// Usage: node extract-h264.mjs <stdout.bin> <out.h264>
// For each video-config (0x02) writes its SPS/PPS, for each video-frame (0x03) its payload.
// Prints a frame summary on stderr.
import { readFileSync, writeFileSync } from 'node:fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: extract-h264.mjs <stdout.bin> <out.h264>');
  process.exit(64);
}

const data = readFileSync(input);
const chunks = [];
const counts = { hello: 0, config: 0, frames: 0, keyframes: 0, events: 0 };
const sizes = new Set();
let offset = 0;
let lastPts = 0n;
while (offset + 5 <= data.length) {
  const type = data[offset];
  const length = data.readUInt32BE(offset + 1);
  const payload = data.subarray(offset + 5, offset + 5 + length);
  if (payload.length < length) break; // truncated tail
  offset += 5 + length;
  if (type === 0x01) {
    counts.hello++;
    console.error('hello', payload.toString('utf8'));
  } else if (type === 0x02) {
    counts.config++;
    sizes.add(`${payload.readUInt16BE(0)}x${payload.readUInt16BE(2)}`);
    chunks.push(payload.subarray(4));
  } else if (type === 0x03) {
    counts.frames++;
    if (payload[0] & 1) counts.keyframes++;
    lastPts = payload.readBigUInt64BE(1);
    chunks.push(payload.subarray(9));
  } else if (type === 0x04) {
    counts.events++;
    console.error('event', payload.toString('utf8'));
  }
}
writeFileSync(output, Buffer.concat(chunks));
console.error(
  `frames=${counts.frames} keyframes=${counts.keyframes} configs=${counts.config} ` +
    `sizes=${[...sizes].join(',')} lastPts=${Number(lastPts) / 1e6}s`,
);
