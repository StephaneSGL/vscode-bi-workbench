import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const common = {
  bundle: true,
  sourcemap: true,
  minify: false,
  logLevel: 'info'
};

const extensionConfig = {
  ...common,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode', '@duckdb/node-bindings', '@aws-sdk/client-s3', 'sql.js']
};

const webviewConfig = {
  ...common,
  entryPoints: ['src/webview/main.ts'],
  outfile: 'dist/webview.js',
  platform: 'browser',
  format: 'iife',
  target: ['chrome120']
};

const testRunnerConfig = {
  ...common,
  entryPoints: ['src/test/runExtensionTests.ts'],
  outfile: 'dist/test/runExtensionTests.js',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode']
};

const extensionTestConfig = {
  ...common,
  entryPoints: ['tests/extension/suite.ts'],
  outfile: 'dist/test/suite/index.js',
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['vscode']
};

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(extensionConfig),
    esbuild.context(webviewConfig),
    esbuild.context(testRunnerConfig),
    esbuild.context(extensionTestConfig)
  ]);
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Watching extension, webview, and extension-test runner...');
} else {
  await Promise.all([
    esbuild.build(extensionConfig),
    esbuild.build(webviewConfig),
    esbuild.build(testRunnerConfig),
    esbuild.build(extensionTestConfig)
  ]);
}
