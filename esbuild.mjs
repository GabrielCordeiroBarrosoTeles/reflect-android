import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const shared = {
  bundle: true,
  minify: production,
  sourcemap: !production,
  logLevel: 'info',
};

const extensionConfig = {
  ...shared,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode', 'bufferutil', 'utf-8-validate'],
};

const webviewConfig = {
  ...shared,
  entryPoints: ['src/webview/main.ts'],
  outdir: 'dist',
  entryNames: 'webview',
  platform: 'browser',
  format: 'esm',
  target: 'chrome120',
};

const configs = [extensionConfig, webviewConfig];

if (watch) {
  const contexts = await Promise.all(configs.map((config) => esbuild.context(config)));
  await Promise.all(contexts.map((context) => context.watch()));
} else {
  await Promise.all(configs.map((config) => esbuild.build(config)));
}
