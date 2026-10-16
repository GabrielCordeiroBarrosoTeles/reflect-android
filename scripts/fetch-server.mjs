import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRCPY_SERVER_VERSION = '3.3.3';
const SCRCPY_SERVER_SHA256 = '7e70323ba7f259649dd4acce97ac4fefbae8102b2c6d91e2e7be613fd5354be0';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve('@yume-chan/fetch-scrcpy-server/package.json'));

execFileSync(process.execPath, [resolve(packageDir, 'bin/fetch-server.js'), SCRCPY_SERVER_VERSION], { stdio: 'inherit' });

const digest = createHash('sha256').update(await readFile(resolve(packageDir, 'server.bin'))).digest('hex');
if (digest !== SCRCPY_SERVER_SHA256) {
  throw new Error(`scrcpy-server checksum mismatch: expected ${SCRCPY_SERVER_SHA256}, got ${digest}`);
}

await mkdir(resolve(root, 'assets'), { recursive: true });
await copyFile(resolve(packageDir, 'server.bin'), resolve(root, 'assets/scrcpy-server.jar'));
await copyFile(resolve(packageDir, 'scrcpy.LICENSE'), resolve(root, 'assets/scrcpy-server.LICENSE'));
console.log(`scrcpy-server ${SCRCPY_SERVER_VERSION} copied to assets/`);
