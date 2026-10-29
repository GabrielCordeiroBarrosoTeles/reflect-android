#!/usr/bin/env node
// Builds the universal reflect-sim-helper binary into assets/ios-helper/ (macOS only).
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  console.log('build-ios-helper: skipped (macOS only)');
  process.exit(0);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = join(root, 'native', 'ios-helper');
const outDir = join(root, 'assets', 'ios-helper');
const out = join(outDir, 'reflect-sim-helper');

execFileSync(
  'swift',
  ['build', '-c', 'release', '--arch', 'arm64', '--arch', 'x86_64', '--package-path', pkg],
  { stdio: 'inherit' },
);

mkdirSync(outDir, { recursive: true });
copyFileSync(join(pkg, '.build', 'apple', 'Products', 'Release', 'reflect-sim-helper'), out);
chmodSync(out, 0o755);
execFileSync('codesign', ['--force', '--sign', '-', out], { stdio: 'inherit' });
console.log(`build-ios-helper: wrote ${out}`);
